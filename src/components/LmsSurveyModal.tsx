"use client";

/**
 * 이수 설문 모달
 *
 * 영상을 다 본 직후 그 자리에서 설문을 받는다. 설문 목록 화면으로 보내지 않는다.
 * 제출하면 서버가 응답 저장과 이수 판정을 함께 처리하고, 그 결과를 onCompleted 로 넘긴다.
 */
import { ClipboardList, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { lmsGet, lmsPost, type CompleteResult, type LmsSurvey } from "@/lib/lms-client";

/** 설문 화면과 동일한 5점 척도 문구 */
const LIKERT = ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다"];

type Props = {
  programId: number;
  onCompleted: (result: CompleteResult) => void;
  onClose: () => void;
};

type AnswerMap = Record<number, string | number>;

export default function LmsSurveyModal({ programId, onCompleted, onClose }: Props) {
  const [survey, setSurvey] = useState<LmsSurvey | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const autoSubmittedRef = useRef(false);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await lmsPost<{ submitted: boolean; completion: CompleteResult }>("/api/lms/survey", {
        programId,
        answers,
      });
      onCompleted(res.completion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }, [answers, onCompleted, programId]);

  useEffect(() => {
    (async () => {
      try {
        const data = await lmsGet<LmsSurvey>(`/api/lms/survey?programId=${programId}`);
        setSurvey(data);
        // 다른 경로로 이미 답한 설문이면 다시 묻지 않고 이수 확정만 진행한다
        if (data.submitted && !autoSubmittedRef.current) {
          autoSubmittedRef.current = true;
          await submit();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "설문을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
    // submit 은 answers 변화로 재생성되지만 최초 1회만 쓰면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  const setAnswer = (questionId: number, value: string | number) =>
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

  const questions = survey?.questions ?? [];
  const allRequiredAnswered = questions
    .filter((q) => q.required)
    .every((q) => {
      const v = answers[q.id];
      return v !== undefined && v !== "" && !(typeof v === "string" && v.trim() === "");
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-ys-blue/10 p-2">
              <ClipboardList className="h-5 w-5 text-ys-blue" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ys-ink">{survey?.title ?? "이수 설문"}</h3>
              <p className="mt-1 text-sm text-ys-ink-soft">
                {survey?.description ?? "영상을 모두 시청했습니다. 설문을 제출하면 이수가 확정됩니다."}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1 text-ys-ink-soft hover:bg-slate-100" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-ys-ink-soft">불러오는 중...</p>
        ) : (
          <>
            <div className="mt-6 space-y-6">
              {questions.map((q, idx) => (
                <div key={q.id}>
                  <p className="mb-2 text-sm font-medium text-ys-ink">
                    {idx + 1}. {q.text} {q.required && <span className="text-red-500">*</span>}
                  </p>

                  {q.type === "likert" && (
                    <div className="flex flex-wrap gap-2">
                      {LIKERT.map((label, i) => (
                        <label
                          key={i}
                          className={`flex cursor-pointer items-center rounded-xl border-2 px-3 py-2 text-xs font-medium transition ${
                            answers[q.id] === i + 1
                              ? "border-blue-600 bg-ys-blue text-white"
                              : "border-slate-200 bg-white text-ys-ink hover:border-ys-blue/40"
                          }`}
                        >
                          <input type="radio" className="sr-only" checked={answers[q.id] === i + 1} onChange={() => setAnswer(q.id, i + 1)} />
                          {i + 1} ({label})
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === "text" && (
                    <textarea
                      value={(answers[q.id] as string) ?? ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      rows={3}
                      placeholder="자유롭게 작성해주세요."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  )}

                  {q.type === "choice" && q.options && (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((opt, i) => (
                        <label
                          key={i}
                          className={`flex cursor-pointer items-center rounded-xl border-2 px-3 py-2 text-xs font-medium transition ${
                            answers[q.id] === opt
                              ? "border-blue-600 bg-ys-blue text-white"
                              : "border-slate-200 bg-white text-ys-ink hover:border-ys-blue/40"
                          }`}
                        >
                          <input type="radio" className="sr-only" checked={answers[q.id] === opt} onChange={() => setAnswer(q.id, opt)} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {questions.length === 0 && !error && (
                <p className="text-sm text-ys-ink-soft">등록된 문항이 없습니다. 담당자에게 문의해 주세요.</p>
              )}
            </div>

            {error && <p className="mt-4 text-xs text-red-600">{error}</p>}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-ys-ink-soft hover:bg-slate-50"
              >
                나중에 하기
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !allRequiredAnswered || questions.length === 0}
                className="rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-ys-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "제출 중..." : "제출하고 이수 확정"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
