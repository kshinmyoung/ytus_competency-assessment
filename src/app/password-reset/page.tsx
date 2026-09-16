 "use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

export default function PasswordResetPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 비밀번호 변경은 서버 라우트가 처리한다.
   * 로그인은 Supabase Auth 가 하므로 students.password 만 고치면 로그인 비밀번호는 그대로다.
   */
  const handlePasswordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const studentId = String(formData.get("studentId") ?? "").trim();
    // 비밀번호는 공백도 값이므로 trim 하지 않는다
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!studentId || !currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage("모든 필드를 입력해 주세요.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data.error ?? "비밀번호를 변경하지 못했습니다.");
        return;
      }

      // 예전 비밀번호로 열린 세션은 서버에서 끊었다. 이 브라우저에 남은 것도 정리한다.
      await supabase.auth.signOut();
      alert("비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.");
      router.push("/login");
    } catch (err) {
      console.error("비밀번호 변경 처리 중 예외:", err);
      setErrorMessage("네트워크 오류로 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.");
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
            <p className="mt-1 text-xs text-ys-ink-soft">8자 이상으로 정해 주세요.</p>
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


