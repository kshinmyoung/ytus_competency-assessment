/**
 * Cloudflare Stream 연동 (서버 전용, 설계서 8장)
 *
 * 이 파일은 Route Handler 안에서만 import 한다.
 * CLOUDFLARE_* 환경변수는 전부 서버 전용이며 NEXT_PUBLIC_ 접두사를 쓰지 않는다.
 */
import { createSign } from "node:crypto";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

/** 서명 토큰 기본 만료: 4시간 (콘텐츠당 1회 발급이므로 재생 중 만료되면 안 된다) */
export const PLAYBACK_TOKEN_TTL_SEC = 4 * 60 * 60;

/** 재생 허용 도메인 (설계서 8.2) */
export const ALLOWED_ORIGINS = ["ytus-competency-assessment.vercel.app"];

/** Cloudflare API 응답 오류. status 를 보존해 Route Handler 가 4xx/5xx 를 구분할 수 있게 한다. */
export class CloudflareError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudflareError";
    this.status = status;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} 환경 변수가 필요합니다. (서버 전용)`);
  }
  return value.trim();
}

function getAccountId(): string {
  return requireEnv("CLOUDFLARE_ACCOUNT_ID");
}

/** Cloudflare API 공통 호출. success=false 면 에러 메시지를 합쳐서 throw 한다. */
async function cfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = requireEnv("CLOUDFLARE_STREAM_API_TOKEN");
  const response = await fetch(`${CF_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; result?: T; errors?: Array<{ code?: number; message?: string }> }
    | null;

  if (!response.ok || !body?.success) {
    const detail = body?.errors?.map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join(", ");
    if (response.status === 404) {
      throw new CloudflareError("영상 UID를 찾을 수 없습니다. Cloudflare Stream 의 UID 를 다시 확인해 주세요.", 404);
    }
    if (response.status === 403) {
      throw new CloudflareError(
        `Cloudflare 403: API 토큰 권한이 'Account / Stream / Edit' 인지 확인해 주세요. ${detail ?? ""}`.trim(),
        403,
      );
    }
    throw new CloudflareError(
      `Cloudflare API 오류 (${response.status}): ${detail || "알 수 없는 오류"}`,
      response.status,
    );
  }

  return body.result as T;
}

export type VideoMeta = {
  uid: string;
  /** 초 단위 정수. 인코딩 미완료면 Cloudflare 가 -1 을 준다. */
  durationSec: number;
  thumbnailUrl: string | null;
  readyToStream: boolean;
  requireSignedURLs: boolean;
  allowedOrigins: string[];
  /** customer-xxxx.cloudflarestream.com — 서명 재생 URL 의 호스트 */
  customerHost: string | null;
};

type CfVideoResult = {
  uid: string;
  duration?: number;
  thumbnail?: string;
  preview?: string;
  readyToStream?: boolean;
  requireSignedURLs?: boolean;
  allowedOrigins?: string[];
};

function toVideoMeta(result: CfVideoResult): VideoMeta {
  const duration = typeof result.duration === "number" ? result.duration : -1;
  // 서명 재생은 customer 서브도메인에서만 동작한다. thumbnail/preview URL 에서 호스트를 뽑는다.
  let customerHost: string | null = null;
  for (const candidate of [result.thumbnail, result.preview]) {
    if (!candidate) continue;
    try {
      const host = new global.URL(candidate).host;
      if (host.startsWith("customer-")) { customerHost = host; break; }
    } catch {
      // URL 파싱 실패는 무시한다
    }
  }
  return {
    uid: result.uid,
    durationSec: duration > 0 ? Math.round(duration) : -1,
    thumbnailUrl: result.thumbnail ?? null,
    readyToStream: result.readyToStream === true,
    requireSignedURLs: result.requireSignedURLs === true,
    allowedOrigins: result.allowedOrigins ?? [],
    customerHost,
  };
}

/**
 * 영상 메타데이터 조회. duration_sec 은 진도율 분모이므로 수기 입력하지 않고 이 값을 쓴다.
 * 인코딩이 끝나지 않으면 readyToStream=false, durationSec=-1 이 나온다.
 */
export async function getVideoMeta(uid: string): Promise<VideoMeta> {
  const result = await cfFetch<CfVideoResult>(`/accounts/${getAccountId()}/stream/${uid}`);
  return toVideoMeta(result);
}

/**
 * 필수 보안 설정 적용 (설계서 8.2).
 * requireSignedURLs=true 여야 링크만으로 재생되지 않는다.
 */
export async function updateVideoSettings(uid: string): Promise<VideoMeta> {
  const result = await cfFetch<CfVideoResult>(`/accounts/${getAccountId()}/stream/${uid}`, {
    method: "POST",
    body: JSON.stringify({
      requireSignedURLs: true,
      allowedOrigins: ALLOWED_ORIGINS,
    }),
  });
  return toVideoMeta(result);
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Cloudflare 가 준 pem 값을 PEM 텍스트로 정규화한다.
 * /stream/keys 응답의 pem 은 base64 로 한 번 더 감싸여 있으나,
 * 사용자가 디코딩된 PEM 을 그대로 등록했을 수도 있어 양쪽을 모두 받는다.
 */
function normalizePem(raw: string): string {
  const value = raw.trim();
  if (value.includes("-----BEGIN")) return value.replace(/\\n/g, "\n");
  return Buffer.from(value, "base64").toString("utf8");
}

/**
 * 재생용 서명 JWT 생성 (RS256).
 * sub = video uid, 기본 만료 4시간.
 */
export function createPlaybackToken(
  uid: string,
  expiresInSec: number = PLAYBACK_TOKEN_TTL_SEC,
): { token: string; expiresAt: string } {
  const keyId = requireEnv("CLOUDFLARE_STREAM_KEY_ID");
  const privateKey = normalizePem(requireEnv("CLOUDFLARE_STREAM_KEY_PEM"));

  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInSec;

  const header = { alg: "RS256", kid: keyId };
  const payload = { sub: uid, kid: keyId, nbf: now, exp };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey).toString("base64url");

  return {
    token: `${signingInput}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}
