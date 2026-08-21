 "use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type StudentRow = {
  student_id: string;
  password: string | null;
  [key: string]: unknown;
};

function getErrorMessage(err: { message?: string; details?: string; hint?: string }): string {
  const msg = err.message ?? "알 수 없는 오류";
  const details = (err as { details?: string }).details;
  const hint = (err as { hint?: string }).hint;
  const parts = [msg];
  if (details) parts.push(`상세: ${details}`);
  if (hint) parts.push(`참고: ${hint}`);
  return parts.join("\n");
}

export default function PasswordResetPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePasswordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const studentId = String(formData.get("studentId") ?? "").trim();
    const currentPassword = String(formData.get("currentPassword") ?? "").trim();
    const newPassword = String(formData.get("newPassword") ?? "").trim();
    const confirmPassword = String(formData.get("confirmPassword") ?? "").trim();

    if (!studentId || !currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage("모든 필드를 입력해 주세요.");
      setIsSubmitting(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      setIsSubmitting(false);
      return;
    }

    try {
      // Step 1: 학생 조회 (student_id는 String으로 비교)
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("student_id", String(studentId));

      if (error) {
        console.error("Supabase 비밀번호 확인 오류:", {
          message: error.message,
          details: (error as { details?: string }).details,
          hint: (error as { hint?: string }).hint,
        });
        alert("조회 중 오류가 발생했습니다.\n\n에러 내용: " + getErrorMessage(error));
        setErrorMessage("학생 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      const student = Array.isArray(data) ? data[0] : null;

      // Step 2: 현재 비밀번호 일치 여부 JS 비교
      if (!student || student.password == null || student.password !== currentPassword) {
        alert("현재 비밀번호가 일치하지 않습니다.");
        setErrorMessage("현재 비밀번호가 일치하지 않습니다.");
        return;
      }

      // Step 3: 비밀번호 업데이트 (student_id로 조건 지정)
      const { error: updateError } = await supabase
        .from("students")
        .update({ password: newPassword })
        .eq("student_id", String(studentId));

      if (updateError) {
        console.error("Supabase 비밀번호 업데이트 오류:", {
          message: updateError.message,
          details: (updateError as { details?: string }).details,
          hint: (updateError as { hint?: string }).hint,
        });
        alert("비밀번호 저장 중 오류가 발생했습니다.\n\n에러 내용: " + getErrorMessage(updateError));
        setErrorMessage("비밀번호를 저장하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      alert("비밀번호가 성공적으로 변경되었습니다.");
      router.push("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("비밀번호 변경 처리 중 예외:", err);
      alert("예기치 않은 오류가 발생했습니다.\n\n에러 내용: " + message);
      setErrorMessage("알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ys-paper px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/logo.png"
            alt="영남신학대학교 로고"
            width={212}
            height={40}
            className="h-10 w-auto"
            priority
          />
          <h1 className="mt-4 text-xl font-semibold text-ys-ink">
            비밀번호 변경
          </h1>
          <p className="mt-1 text-sm text-ys-ink-soft">
            본인 확인을 위해 학번과 현재(또는 초기) 비밀번호를 입력해 주세요.
          </p>
        </div>

        <form onSubmit={handlePasswordUpdate} className="space-y-5">
          <div>
            <label
              htmlFor="studentId"
              className="block text-sm font-medium text-ys-ink"
            >
              학번 (Student ID)
            </label>
            <input
              id="studentId"
              name="studentId"
              type="text"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ys-ink shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="예: 20261234"
            />
          </div>

          <div>
            <label
              htmlFor="currentPassword"
              className="block text-sm font-medium text-ys-ink"
            >
              현재 비밀번호 (또는 초기 비밀번호)
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ys-ink shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-ys-ink"
            >
              새 비밀번호
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ys-ink shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-ys-ink"
            >
              새 비밀번호 확인
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ys-ink shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {errorMessage && (
            <p className="text-xs font-medium text-red-500">{errorMessage}</p>
          )}

          <div className="mt-4 flex flex-col gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-ys-blue px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-ys-blue/90 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {isSubmitting ? "저장 중..." : "비밀번호 저장하기"}
            </button>
            <Link
              href="/login"
              className="w-full rounded-full border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-ys-ink transition hover:border-slate-400 hover:bg-ys-paper"
            >
              취소
            </Link>
          </div>
        </form>

        <div className="mt-8 border-t border-slate-100 pt-4 text-center">
          <Link
            href="/"
            className="text-xs font-medium text-ys-ink-soft hover:text-ys-ink hover:underline"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}


