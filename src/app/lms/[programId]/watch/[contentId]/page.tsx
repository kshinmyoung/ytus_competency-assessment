"use client";

import { ArrowLeft, CheckCircle2, ChevronUp, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatClock, lmsGet, lmsPost, type LmsProgramDetail } from "@/lib/lms-client";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

/** 설계서 9.1 — 배속 상한 1.5. 이 세 개만 노출한다. */
const PLAYBACK_RATES = [1.0, 1.25, 1.5];
const MAX_RATE = 1.5;

/** 워터마크 위치 (5분마다 순환) */
const WATERMARK_SPOTS = [
  "top-6 left-6", "top-6 right-6", "bottom-16 left-6",
  "bottom-16 right-6", "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
];
const WATERMARK_MOVE_MS = 5 * 60 * 1000;

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

  const content = detail?.contents.find((c) => c.contentId === contentId);

  // 커리큘럼 + 재생 토큰
  useEffect(() => {
    (async () => {
      try {
        const [data, token] = await Promise.all([
          lmsGet<LmsProgramDetail>(`/api/lms/programs/${programId}`),
          lmsPost<{ iframeUrl: string | null }>("/api/lms/playback-token", { contentId }),
        ]);
        setDetail(data);
        if (!token.iframeUrl) throw new Error("재생 주소를 확인할 수 없습니다.");
        setIframeUrl(token.iframeUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "영상을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [programId, contentId]);

  // 워터마크 문구 (학번 · 이름)
  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid) return;
      const { data } = await supabase.from("students").select("name").eq("student_id", sid.trim()).maybeSingle();
      setWatermark(`${sid.trim()} ${data?.name ?? ""}`.trim());
    })();
  }, []);

  // 5분마다 워터마크 위치 이동
  useEffect(() => {
    const timer = setInterval(() => {
      setSpotIndex((i) => (i + 1) % WATERMARK_SPOTS.length);
    }, WATERMARK_MOVE_MS);
    return () => clearInterval(timer);
  }, []);

  // SDK 초기화. 배속 상한을 넘기면 되돌린다.
  const initPlayer = useCallback(() => {
    if (!sdkReady || !iframeUrl || !iframeRef.current || !window.Stream) return;
    if (playerRef.current) return;

    const player = window.Stream(iframeRef.current);
    playerRef.current = player;

    const onRateChange = () => {
      if (player.playbackRate > MAX_RATE) {
        player.playbackRate = MAX_RATE;
        setRate(MAX_RATE);
      } else {
        setRate(player.playbackRate);
      }
    };
    player.addEventListener("ratechange", onRateChange);
  }, [sdkReady, iframeUrl]);

  useEffect(() => { initPlayer(); }, [initPlayer]);

  const changeRate = (value: number) => {
    setRate(value);
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

  const curriculum = (
    <ol className="space-y-1">
      {detail.contents.map((c, idx) => {
        const isCurrent = c.contentId === contentId;
        return (
          <li key={c.contentId}>
            <Link
              href={`/lms/${programId}/watch/${c.contentId}`}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${
                isCurrent ? "bg-blue-600/20 text-white" : "text-slate-300 hover:bg-white/5"
              }`}
            >
              <span className="w-5 shrink-0 text-center">
                {c.passed ? (
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
                  {formatClock(c.durationSec)} · 진도 {c.progress}%
                  {!c.isRequired && " · 선택"}
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
        {/* 좌: 플레이어 */}
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
                src={`${iframeUrl}?preload=auto&letterboxColor=transparent`}
                title={content.title}
                allow="accelerometer; gyroscope; encrypted-media; picture-in-picture;"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
              {/* 학번·이름 워터마크 — 클릭을 가로채지 않는다 */}
              {watermark && (
                <div
                  className={`pointer-events-none absolute z-10 select-none text-[11px] font-medium text-white/35 drop-shadow sm:text-xs ${WATERMARK_SPOTS[spotIndex]}`}
                >
                  {watermark}
                </div>
              )}
            </div>
          </div>

          {/* 배속 */}
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
            <p className="text-[11px] text-slate-500">
              건너뛴 구간은 진도에 포함되지 않습니다.
            </p>
          </div>
        </div>

        {/* 우: 커리큘럼 (데스크톱) */}
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-white/10 p-4 lg:block">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            커리큘럼 · 필수 {detail.requiredPassed}/{detail.requiredTotal}
          </p>
          {curriculum}
        </aside>

        {/* 하단 접이식 커리큘럼 (모바일) */}
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

    </div>
  );
}
