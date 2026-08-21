"use client";

import { ArrowLeft, Award, CheckCircle2, Clock, FileDown, Lock, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatClock, formatDuration, lmsGet, openCertificate, type LmsProgramDetail } from "@/lib/lms-client";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

export default function LmsProgramPage() {
  const params = useParams();
  const programId = Number(params.programId);

  const [data, setData] = useState<LmsProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [certError, setCertError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await lmsGet<LmsProgramDetail>(`/api/lms/programs/${programId}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => { load(); }, [load]);

  // 신청은 기존 비교과 화면과 동일하게 student_extracurricular 에 직접 넣는다.
  // status 는 '신청' 그대로 두고 학습 진행 상태는 진도로 파생한다.
  const handleEnroll = async () => {
    const sid = await getCurrentStudentId();
    if (!sid) return;
    setEnrolling(true);
    const { error: insertError } = await supabase.from("student_extracurricular").insert({
      student_id: sid.trim(),
      extracurricular_id: programId,
      status: "신청",
    });
    setEnrolling(false);
    if (insertError) { alert(insertError.message); return; }
    await load();
  };

  if (loading) return <p className="py-16 text-center text-sm text-ys-ink-soft">불러오는 중...</p>;

  if (error || !data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-ys-ink-soft">{error || "프로그램을 찾을 수 없습니다."}</p>
        <Link href="/lms" className="mt-3 inline-block text-sm font-medium text-ys-blue hover:text-ys-blue">
          학습 홈으로
        </Link>
      </div>
    );
  }

  const { program, contents, enrolled, status, progress, requiredPassed, requiredTotal, completion, studentType } = data;

  return (
    <div>
      <Link href="/lms" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ys-ink-soft hover:text-ys-ink">
        <ArrowLeft className="h-4 w-4" />
        학습 홈
      </Link>

      {/* 프로그램 헤더 */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                status === "이수완료" ? "bg-ys-gold/12 text-ys-ink"
                  : status === "학습중" ? "bg-ys-blue/10 text-ys-blue"
                  : "bg-slate-100 text-ys-ink-soft"
              }`}>
                {enrolled ? status : "미신청"}
              </span>
              {program.organizer && <span className="text-[11px] text-ys-ink-soft/70">{program.organizer}</span>}
            </div>
            <h1 className="text-xl font-bold text-ys-ink">{program.name}</h1>
            {program.description && <p className="mt-2 text-sm text-ys-ink-soft">{program.description}</p>}
          </div>

          {!enrolled && (
            <button
              type="button"
              onClick={handleEnroll}
              disabled={enrolling || !program.registrationOpen}
              className="shrink-0 rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-ys-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enrolling ? "신청 중..." : program.registrationOpen ? "신청하고 학습 시작" : "신청 기간이 아닙니다"}
            </button>
          )}
        </div>

        {/* 진도 요약 */}
        {enrolled && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-ys-ink-soft">
                필수 콘텐츠 {requiredPassed} / {requiredTotal} 완료 · 이수 기준 진도 {program.minProgress}%
              </span>
              <span className="font-semibold text-ys-ink">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${status === "이수완료" ? "bg-ys-gold" : "bg-ys-blue"}`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ys-ink-soft">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                총 {formatDuration(contents.reduce((s, c) => s + c.durationSec, 0))}
              </span>
              {studentType === "domestic" && program.completionMileage > 0 && (
                <span className="flex items-center gap-1">
                  <Award className="h-3.5 w-3.5" />
                  이수 시 {program.completionMileage}점
                </span>
              )}
            </div>

            {completion && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ys-gold/12 px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-ys-ink">
                    이수 완료 · 수료번호 {completion.certificate_no ?? "-"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ys-ink">
                    최종 진도 {completion.final_progress}%
                    {studentType === "domestic" && completion.mileage_granted > 0 && ` · 마일리지 ${completion.mileage_granted}점 지급`}
                  </p>
                </div>
                {completion.certificate_no && (
                  <button
                    type="button"
                    onClick={async () => {
                      setCertError("");
                      try { await openCertificate(completion.certificate_no!); }
                      catch (e) { setCertError(e instanceof Error ? e.message : "수료증 열기 실패"); }
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-ys-gold/50 bg-white px-3 py-1.5 text-xs font-medium text-ys-ink hover:bg-ys-gold/12"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    수료증 보기
                  </button>
                )}
              </div>
            )}
            {certError && <p className="mt-2 text-xs text-red-600">{certError}</p>}
          </div>
        )}
      </div>

      {/* 커리큘럼 */}
      <h2 className="mb-3 text-sm font-bold text-ys-ink">커리큘럼</h2>

      {contents.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-ys-ink-soft">등록된 콘텐츠가 없습니다.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {contents.map((c, idx) => {
            const body = (
              <>
                <div className="flex w-8 shrink-0 items-center justify-center">
                  {c.passed ? (
                    <CheckCircle2 className="h-5 w-5 text-ys-gold" />
                  ) : enrolled ? (
                    <PlayCircle className="h-5 w-5 text-ys-ink-soft/70 group-hover:text-ys-blue" />
                  ) : (
                    <Lock className="h-4 w-4 text-ys-ink-soft/50" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-ys-ink-soft/70">{idx + 1}</span>
                    <p className={`text-sm font-medium ${enrolled ? "text-ys-ink" : "text-ys-ink-soft"}`}>{c.title}</p>
                    {!c.isRequired && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-ys-ink-soft">선택</span>
                    )}
                  </div>
                  {c.description && <p className="mt-0.5 line-clamp-1 text-xs text-ys-ink-soft">{c.description}</p>}

                  {enrolled && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${c.passed ? "bg-ys-gold" : "bg-ys-blue"}`}
                          style={{ width: `${Math.min(c.progress, 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-ys-ink-soft">{c.progress}%</span>
                      {c.lastPositionSec > 0 && !c.passed && (
                        <span className="text-[11px] text-ys-ink-soft/70">· {formatClock(c.lastPositionSec)}부터 이어보기</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {c.attachmentUrl && (
                    <span className="text-ys-ink-soft/70" title="첨부 자료">
                      <FileDown className="h-4 w-4" />
                    </span>
                  )}
                  <span className="text-xs text-ys-ink-soft/70">{formatClock(c.durationSec)}</span>
                </div>
              </>
            );

            return (
              <li key={c.contentId}>
                {enrolled ? (
                  <Link
                    href={`/lms/${programId}/watch/${c.contentId}`}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-ys-blue/40 hover:shadow"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm opacity-70">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!enrolled && (
        <p className="mt-4 text-center text-xs text-ys-ink-soft/70">
          신청하면 콘텐츠를 재생할 수 있습니다.
        </p>
      )}
    </div>
  );
}
