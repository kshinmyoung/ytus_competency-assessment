"use client";

import { Award, Clock, Film, ListVideo, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDuration, lmsGet, type LmsProgramSummary } from "@/lib/lms-client";

type TabKey = "learning" | "available" | "completed";

const TABS: { key: TabKey; label: string }[] = [
  { key: "learning", label: "학습중" },
  { key: "available", label: "신청가능" },
  { key: "completed", label: "이수완료" },
];

export default function LmsHomePage() {
  const [programs, setPrograms] = useState<LmsProgramSummary[]>([]);
  const [studentType, setStudentType] = useState("domestic");
  const [tab, setTab] = useState<TabKey>("learning");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await lmsGet<{ studentType: string; programs: LmsProgramSummary[] }>("/api/lms/programs");
        setStudentType(data.studentType);
        setPrograms(data.programs);
      } catch (e) {
        setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 설계서 7장 deriveStatus 로 서버가 내려준 status 를 그대로 쓴다.
  // 세 탭은 서로 겹치지 않고 모든 프로그램을 빠짐없이 담는다.
  const buckets = useMemo(() => ({
    learning: programs.filter((p) => p.enrolled && p.status !== "이수완료"),
    available: programs.filter((p) => !p.enrolled),
    completed: programs.filter((p) => p.enrolled && p.status === "이수완료"),
  }), [programs]);

  const visible = buckets[tab];

  if (loading) {
    return <p className="py-16 text-center text-sm text-ys-ink-soft">불러오는 중...</p>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-ys-ink-soft">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ys-ink">영상 학습</h1>
        <p className="mt-1 text-sm text-ys-ink-soft">
          신청한 영상 비교과를 온라인으로 수강하고 이수할 수 있습니다.
        </p>
      </div>

      {/* 요약 */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-xl border p-4 text-left transition ${
              tab === t.key
                ? "border-ys-blue/40 bg-ys-blue/10"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <p className="text-xs font-medium text-ys-ink-soft">{t.label}</p>
            <p className={`mt-1 text-2xl font-bold ${tab === t.key ? "text-ys-blue" : "text-ys-ink"}`}>
              {buckets[t.key].length}
            </p>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Film className="mx-auto mb-3 h-8 w-8 text-ys-ink-soft/50" />
          <p className="text-sm text-ys-ink-soft">
            {tab === "learning" && "신청한 영상 프로그램이 없습니다."}
            {tab === "available" && "신청 가능한 영상 프로그램이 없습니다."}
            {tab === "completed" && "이수 완료한 영상 프로그램이 없습니다."}
          </p>
          {tab === "available" && (
            <Link href="/extracurricular" className="mt-3 inline-block text-sm font-medium text-ys-blue hover:text-ys-blue">
              비교과 신청 페이지로 이동
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((p) => (
            <Link
              key={p.id}
              href={`/lms/${p.id}`}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-ys-blue/40 hover:shadow"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h2 className="text-sm font-bold text-ys-ink group-hover:text-ys-blue">{p.name}</h2>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  p.status === "이수완료" ? "bg-ys-gold/12 text-ys-ink"
                    : p.status === "학습중" ? "bg-ys-blue/10 text-ys-blue"
                    : "bg-slate-100 text-ys-ink-soft"
                }`}>
                  {p.enrolled ? p.status : "미신청"}
                </span>
              </div>

              {p.description && (
                <p className="mb-3 line-clamp-2 text-xs text-ys-ink-soft">{p.description}</p>
              )}

              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ys-ink-soft">
                <span className="flex items-center gap-1">
                  <ListVideo className="h-3.5 w-3.5" />
                  콘텐츠 {p.contentCount}개
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(p.totalDurationSec)}
                </span>
                {/* 마일리지는 내국인에게만 노출한다 */}
                {studentType === "domestic" && p.completionMileage > 0 && (
                  <span className="flex items-center gap-1">
                    <Award className="h-3.5 w-3.5" />
                    {p.completionMileage}점
                  </span>
                )}
              </div>

              {p.enrolled ? (
                <div className="mt-auto">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-ys-ink-soft">진도율</span>
                    <span className="font-semibold text-ys-ink">{p.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${p.status === "이수완료" ? "bg-ys-gold" : "bg-ys-blue"}`}
                      style={{ width: `${Math.min(p.progress, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-ys-blue">
                    <PlayCircle className="h-3.5 w-3.5" />
                    {p.status === "이수완료" ? "다시 보기" : p.watchedSec > 0 ? "이어서 학습하기" : "학습 시작"}
                  </p>
                </div>
              ) : (
                <p className="mt-auto text-[11px] text-ys-ink-soft/70">
                  신청 후 학습할 수 있습니다. 이수 기준 진도 {p.minProgress}%
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
