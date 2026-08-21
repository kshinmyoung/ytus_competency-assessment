"use client";

import { ArrowLeft, CheckCircle2, ChevronUp, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatClock, lmsGet, lmsPost, openCertificate,
  type CompleteResult, type LmsProgramDetail,
} from "@/lib/lms-client";
import { supabase, waitForAccessToken, waitForStudentId } from "@/lib/supabase";

/** 설계서 9.1 — 배속 상한 1.5. 이 세 개만 노출한다. */
const PLAYBACK_RATES = [1.0, 1.25, 1.5];
const MAX_RATE = 1.5;

/** 설계서 9.1 진도 수집 파라미터 */
const SEGMENT_SEC = 10;        // 10초 단위로 구간을 끊는다
const BATCH_SIZE = 6;          // 6구간 = 60초마다 전송
const MAX_BATCH = 10;          // 한 번에 보낼 수 있는 최대 구간 수 (서버 상한)
const FLUSH_INTERVAL_MS = 60_000;
const SEEK_THRESHOLD_SEC = 2;  // 이보다 크게 튀면 시킹으로 본다

/** 워터마크 위치 (5분마다 순환) */
const WATERMARK_SPOTS = [
  "top-6 left-6", "top-6 right-6", "bottom-16 left-6",
  "bottom-16 right-6", "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
];
const WATERMARK_MOVE_MS = 5 * 60 * 1000;

/** 재전송해도 소용없는 거부 사유 — 큐에서 버린다 */
const PERMANENT_REJECTS = ["NO_VALID_SEGMENT", "INVALID_PAYLOAD", "TOO_MANY_SEGMENTS", "CONTENT_NOT_FOUND"];

type StreamPlayer = {
  playbackRate: number;
  currentTime: number;
  paused: boolean;
  play: () => Promise<void> | void;
  pause: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

declare global {
  interface Window {
    Stream?: (iframe: HTMLIFrameElement) => StreamPlayer;
  }
}

export default function LmsWatchPage() {
  const params = useParams();
  const programId = Number(params.programId);
  const contentId = Number(params.contentId);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<StreamPlayer | null>(null);

  const [detail, setDetail] = useState<LmsProgramDetail | null>(null);
  const [iframeUrl, setIframeUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [rate, setRate] = useState(1.0);
  const [watermark, setWatermark] = useState("");
  const [spotIndex, setSpotIndex] = useState(0);
  const [curriculumOpen, setCurriculumOpen] = useState(false);

  // 진도 — 서버가 계산한 값만 표시한다 (클라이언트 계산 금지)
  const [progress, setProgress] = useState(0);
  const [watchedSec, setWatchedSec] = useState(0);
  const [notice, setNotice] = useState("");

  // 구간 수집 상태
  const segStartRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const queueRef = useRef<[number, number][]>([]);
  const sendingRef = useRef(false);
  const rateRef = useRef(1.0);
  const tokenRef = useRef("");        // 페이지 이탈 시 동기적으로 써야 해서 캐시

  // 이수 확정
  const minProgressRef = useRef(0);
  const completeTriedRef = useRef(false);
  const [completion, setCompletion] = useState<CompleteResult | null>(null);
  const [certError, setCertError] = useState("");

  const content = detail?.contents.find((c) => c.contentId === contentId);
  const durationSec = content?.durationSec ?? 0;

  /**
   * 이어보기 지점.
   * currentTime 을 loadeddata 에서 설정하면 HLS 의 seekable 범위가 아직 준비되지 않아
   * 포스터에만 반영되고 재생 시 0 으로 되돌아간다. Cloudflare 의 startTime 파라미터를 쓴다.
   * 끝까지 본 경우에는 처음부터 시작한다 (끝에서 이어봐야 볼 게 없다).
   */
  const resumeAt = content && content.lastPositionSec > 0 && content.lastPositionSec < durationSec - 5
    ? content.lastPositionSec
    : 0;

  // ---- 데이터 로드 ----
  useEffect(() => {
    (async () => {
      try {
        const [data, token] = await Promise.all([
          lmsGet<LmsProgramDetail>(`/api/lms/programs/${programId}`),
          lmsPost<{ iframeUrl: string | null }>("/api/lms/playback-token", { contentId }),
        ]);
        setDetail(data);
        minProgressRef.current = data.program.minProgress;
        const c = data.contents.find((x) => x.contentId === contentId);
        if (c) {
          setProgress(c.progress);
          setWatchedSec(c.watchedSec);
          // 이미 기준을 넘긴 콘텐츠는 재진입 시 이수 확정을 다시 시도하지 않는다
          if (data.completion) completeTriedRef.current = true;
        }
        if (!token.iframeUrl) throw new Error("재생 주소를 확인할 수 없습니다.");
        setIframeUrl(token.iframeUrl);
        tokenRef.current = (await waitForAccessToken()) ?? "";
      } catch (e) {
        setError(e instanceof Error ? e.message : "영상을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [programId, contentId]);

  // ---- 워터마크 ----
  useEffect(() => {
    (async () => {
      const sid = await waitForStudentId();
      if (!sid) return;
      const { data } = await supabase.from("students").select("name").eq("student_id", sid.trim()).maybeSingle();
      setWatermark(`${sid.trim()} ${data?.name ?? ""}`.trim());
    })();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setSpotIndex((i) => (i + 1) % WATERMARK_SPOTS.length), WATERMARK_MOVE_MS);
    return () => clearInterval(timer);
  }, []);

  // ---- 진도 전송 ----
  const flush = useCallback(async (keepalive = false) => {
    if (sendingRef.current || queueRef.current.length === 0 || !tokenRef.current) return;
    const batch = queueRef.current.slice(0, MAX_BATCH);
    sendingRef.current = true;
    try {
      const res = await fetch("/api/lms/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenRef.current}` },
        body: JSON.stringify({ contentId, segments: batch, rate: rateRef.current }),
        keepalive,
      });
      const body = await res.json().catch(() => null);

      if (res.ok && body) {
        queueRef.current = queueRef.current.slice(batch.length);
        setProgress(Number(body.progress ?? 0));
        setWatchedSec(Number(body.watchedSec ?? 0));
        setNotice("");
        // 이 콘텐츠가 기준을 넘으면 이수 확정을 한 번 시도한다.
        // 다른 필수 콘텐츠가 남았으면 서버가 incomplete 를 돌려주므로 모달을 띄우지 않는다.
        if (minProgressRef.current > 0 && Number(body.progress ?? 0) >= minProgressRef.current
            && !completeTriedRef.current) {
          completeTriedRef.current = true;
          try {
            const r = await lmsPost<CompleteResult>("/api/lms/complete", { programId });
            if (r.status !== "incomplete") setCompletion(r);
          } catch {
            // 이수 확정 실패는 시청을 막지 않는다. 커리큘럼 화면에서 다시 시도할 수 있다.
            completeTriedRef.current = false;
          }
        }
      } else if (body && PERMANENT_REJECTS.includes(body.reason)) {
        // 다시 보내도 거부될 배치는 버린다 (무한 재전송 방지)
        queueRef.current = queueRef.current.slice(batch.length);
        setNotice(body.error ?? "");
      } else {
        // 일시적 실패 — 큐를 유지해 다음 전송에 함께 보낸다
        setNotice(body?.error ?? "진도 저장에 실패했습니다. 잠시 후 다시 시도합니다.");
      }
    } catch {
      // 네트워크 오류 — 큐 유지
      setNotice("진도 저장에 실패했습니다. 잠시 후 다시 시도합니다.");
    } finally {
      sendingRef.current = false;
    }
  }, [contentId, programId]);

  /** 현재 누적 구간을 마감해 큐에 넣는다. 1초 미만이거나 시킹으로 끊긴 조각은 버린다. */
  const closeSegment = useCallback((end: number) => {
    const start = segStartRef.current;
    segStartRef.current = null;
    if (start === null) return;
    const s = Math.max(0, Math.floor(start));
    const e = Math.min(Math.floor(end), durationSec > 0 ? durationSec : Math.floor(end));
    if (e - s < 1) return;
    // 서버가 15초 초과 구간을 거부하므로 안전하게 잘라 담는다
    queueRef.current.push([s, Math.min(e, s + 15)]);
  }, [durationSec]);

  // ---- SDK 초기화 및 이벤트 연결 ----
  const initPlayer = useCallback(() => {
    if (!sdkReady || !iframeUrl || !iframeRef.current || !window.Stream) return;
    if (playerRef.current) return;

    const player = window.Stream(iframeRef.current);
    playerRef.current = player;

    const onTimeUpdate = () => {
      const t = player.currentTime;
      if (!Number.isFinite(t)) return;

      if (segStartRef.current === null) {
        segStartRef.current = t;
        lastTimeRef.current = t;
        return;
      }

      const delta = t - lastTimeRef.current;
      if (delta < 0 || delta > SEEK_THRESHOLD_SEC) {
        // 시킹 — 건너뛴 구간은 진도에 넣지 않는다
        closeSegment(lastTimeRef.current);
        segStartRef.current = t;
        lastTimeRef.current = t;
        return;
      }

      lastTimeRef.current = t;
      if (t - segStartRef.current >= SEGMENT_SEC) {
        closeSegment(t);
        segStartRef.current = t;
        if (queueRef.current.length >= BATCH_SIZE) void flush();
      }
    };

    const onPause = () => {
      closeSegment(lastTimeRef.current);
      void flush();
    };

    const onEnded = () => {
      closeSegment(lastTimeRef.current);
      void flush();
    };

    const onRateChange = () => {
      const r = player.playbackRate > MAX_RATE ? MAX_RATE : player.playbackRate;
      if (player.playbackRate > MAX_RATE) player.playbackRate = MAX_RATE;
      // 배속이 바뀌면 진행 중 구간을 마감해 배치별 rate 를 정확히 남긴다
      closeSegment(lastTimeRef.current);
      segStartRef.current = player.currentTime;
      rateRef.current = r;
      setRate(r);
    };

    player.addEventListener("timeupdate", onTimeUpdate);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    player.addEventListener("ratechange", onRateChange);
  }, [sdkReady, iframeUrl, closeSegment, flush]);

  useEffect(() => { initPlayer(); }, [initPlayer]);

  // ---- 60초 주기 전송 ----
  useEffect(() => {
    const timer = setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [flush]);

  // ---- 탭 이탈 시 자동 일시정지 + 즉시 전송 ----
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      playerRef.current?.pause();
      closeSegment(lastTimeRef.current);
      void flush(true);
    };
    const onPageHide = () => {
      closeSegment(lastTimeRef.current);
      void flush(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      // 다른 콘텐츠로 이동할 때도 남은 구간을 흘려보낸다
      onPageHide();
    };
  }, [closeSegment, flush]);

  const changeRate = (value: number) => {
    setRate(value);
    rateRef.current = value;
    if (playerRef.current) playerRef.current.playbackRate = value;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">불러오는 중...</p>
      </div>
    );
  }

  if (error || !detail || !content) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6">
        <p className="text-center text-sm text-slate-300">{error || "콘텐츠를 찾을 수 없습니다."}</p>
        <Link href={`/lms/${programId}`} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          커리큘럼으로 돌아가기
        </Link>
      </div>
    );
  }

  const passed = progress >= detail.program.minProgress;

  const curriculum = (
    <ol className="space-y-1">
      {detail.contents.map((c, idx) => {
        const isCurrent = c.contentId === contentId;
        const shownProgress = isCurrent ? progress : c.progress;
        return (
          <li key={c.contentId}>
            <Link
              href={`/lms/${programId}/watch/${c.contentId}`}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${
                isCurrent ? "bg-blue-600/20 text-white" : "text-slate-300 hover:bg-white/5"
              }`}
            >
              <span className="w-5 shrink-0 text-center">
                {shownProgress >= detail.program.minProgress ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : isCurrent ? (
                  <PlayCircle className="h-4 w-4 text-blue-400" />
                ) : (
                  <span className="text-xs text-slate-500">{idx + 1}</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.title}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  {formatClock(c.durationSec)} · 진도 {shownProgress}%{!c.isRequired && " · 선택"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="min-h-screen bg-slate-950">
      {/* 이 페이지에서만 Stream SDK 를 로드한다 (hls.js 는 쓰지 않는다) */}
      <Script
        src="https://embed.cloudflarestream.com/embed/sdk.latest.js"
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
      />

      <div className="mx-auto flex max-w-[1600px] flex-col lg:h-screen lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 px-4 py-3">
            <Link
              href={`/lms/${programId}`}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              나가기
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{content.title}</p>
              <p className="truncate text-[11px] text-slate-500">{detail.program.name}</p>
            </div>
          </header>

          <div className="relative bg-black">
            <div className="relative aspect-video w-full">
              <iframe
                ref={iframeRef}
                src={`${iframeUrl}?preload=auto&letterboxColor=transparent${resumeAt > 0 ? `&startTime=${resumeAt}s` : ""}`}
                title={content.title}
                allow="accelerometer; gyroscope; encrypted-media; picture-in-picture;"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
              {watermark && (
                <div className={`pointer-events-none absolute z-10 select-none text-[11px] font-medium text-white/35 drop-shadow sm:text-xs ${WATERMARK_SPOTS[spotIndex]}`}>
                  {watermark}
                </div>
              )}
            </div>
          </div>

          {/* 진도 — 서버 응답값 그대로 표시 */}
          <div className="px-4 pt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">
                진도 {formatClock(watchedSec)} / {formatClock(durationSec)} · 이수 기준 {detail.program.minProgress}%
              </span>
              <span className={`font-semibold ${passed ? "text-emerald-400" : "text-slate-300"}`}>
                {progress}%{passed && " · 완료"}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${passed ? "bg-emerald-500" : "bg-blue-500"}`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="text-[11px] text-slate-500">재생 속도</span>
            <div className="flex gap-1">
              {PLAYBACK_RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => changeRate(r)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    rate === r ? "bg-blue-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">건너뛴 구간은 진도에 포함되지 않습니다.</p>
            {notice && <p className="text-[11px] text-amber-400">{notice}</p>}
          </div>
        </div>

        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-white/10 p-4 lg:block">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            커리큘럼 · 필수 {detail.requiredPassed}/{detail.requiredTotal}
          </p>
          {curriculum}
        </aside>

        <div className="border-t border-white/10 lg:hidden">
          <button
            type="button"
            onClick={() => setCurriculumOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-300"
          >
            <span>커리큘럼 · 필수 {detail.requiredPassed}/{detail.requiredTotal}</span>
            <ChevronUp className={`h-4 w-4 transition-transform ${curriculumOpen ? "" : "rotate-180"}`} />
          </button>
          {curriculumOpen && <div className="px-4 pb-4">{curriculum}</div>}
        </div>
      </div>

      {/* 이수 결과 모달 */}
      {completion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
            {completion.status === "completed" && (
              <>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">이수 완료</h3>
                <p className="mt-1.5 text-sm text-slate-600">
                  {detail.program.name} 과정을 이수했습니다.
                </p>
                <div className="mt-4 space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-left text-xs text-slate-600">
                  <p>수료번호 <span className="font-medium text-slate-900">{completion.certificate_no}</span></p>
                  <p>최종 진도 <span className="font-medium text-slate-900">{completion.final_progress}%</span></p>
                  {/* 마일리지는 내국인에게만 표시한다 */}
                  {detail.studentType === "domestic" && (completion.mileage_granted ?? 0) > 0 && (
                    <p>마일리지 <span className="font-medium text-blue-700">{completion.mileage_granted}점 지급</span></p>
                  )}
                </div>
                {certError && <p className="mt-3 text-xs text-red-600">{certError}</p>}
                <div className="mt-5 flex gap-2">
                  {completion.certificate_no && (
                    <button
                      type="button"
                      onClick={async () => {
                        setCertError("");
                        try { await openCertificate(completion.certificate_no!); }
                        catch (e) { setCertError(e instanceof Error ? e.message : "수료증 열기 실패"); }
                      }}
                      className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      수료증 보기
                    </button>
                  )}
                  <Link
                    href={`/lms/${programId}`}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    확인
                  </Link>
                </div>
              </>
            )}

            {completion.status === "already_completed" && (
              <>
                <h3 className="text-base font-bold text-slate-900">이미 이수한 과정입니다</h3>
                <p className="mt-1.5 text-sm text-slate-600">추가로 처리할 내용이 없습니다.</p>
                <button
                  type="button"
                  onClick={() => setCompletion(null)}
                  className="mt-5 w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
                >
                  닫기
                </button>
              </>
            )}

            {completion.status === "survey_required" && (
              <>
                <h3 className="text-base font-bold text-slate-900">설문 제출이 필요합니다</h3>
                <p className="mt-1.5 text-sm text-slate-600">
                  진도는 모두 채웠습니다. 만족도 설문을 제출하면 이수가 확정됩니다.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCompletion(null)}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    나중에
                  </button>
                  <Link
                    href="/survey"
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    설문 하러 가기
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
