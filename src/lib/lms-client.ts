/**
 * 학생용 LMS API 클라이언트 (브라우저)
 *
 * LMS 데이터는 RLS 정책이 없는 테이블을 쓰므로 반드시 /api/lms/* 를 경유한다.
 * 진도율 등 계산값은 서버 응답을 그대로 쓰고 클라이언트에서 다시 계산하지 않는다.
 */
import { supabase } from "@/lib/supabase";

export type LmsStatus = "신청" | "학습중" | "이수완료";

export type LmsProgramSummary = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  organizer: string | null;
  deliveryType: string;
  targetAudience: string;
  thumbnailUrl: string | null;
  registrationOpen: boolean;
  completionMileage: number;
  minProgress: number;
  contentCount: number;
  requiredCount: number;
  totalDurationSec: number;
  enrolled: boolean;
  progress: number;
  watchedSec: number;
  status: LmsStatus;
  certificateNo: string | null;
  completedAt: string | null;
};

export type LmsContent = {
  contentId: number;
  title: string;
  description: string | null;
  durationSec: number;
  language: string;
  contentOrder: number;
  isRequired: boolean;
  attachmentUrl: string | null;
  progress: number;
  watchedSec: number;
  lastPositionSec: number;
  passed: boolean;
};

export type LmsProgramDetail = {
  studentType: string;
  program: {
    id: number;
    name: string;
    description: string | null;
    category: string | null;
    organizer: string | null;
    deliveryType: string;
    targetAudience: string;
    thumbnailUrl: string | null;
    registrationOpen: boolean;
    completionMileage: number;
    minProgress: number;
  };
  enrolled: boolean;
  enrolledStatus: string | null;
  status: LmsStatus;
  progress: number;
  requiredPassed: number;
  requiredTotal: number;
  completion: { certificate_no: string | null; completed_at: string; final_progress: number; mileage_granted: number } | null;
  contents: LmsContent[];
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

/** GET 요청. 실패 시 서버가 준 error 메시지를 그대로 던진다. */
export async function lmsGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: await authHeaders() });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "요청에 실패했습니다.");
  return body as T;
}

export async function lmsPost<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "요청에 실패했습니다.");
  return body as T;
}

/** 초 → "1시간 23분" / "5분 12초" */
export function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "0분";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

/** 재생 시간 표기 "12:34" */
export function formatClock(sec: number): string {
  if (!sec || sec <= 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
