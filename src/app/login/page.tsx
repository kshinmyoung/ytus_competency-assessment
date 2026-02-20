"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type StudentRow = { student_id: string; name: string | null; role: string | null };

export default function LoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const studentId = String(formData.get("studentId") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!studentId || !password) {
      setErrorMessage("학번과 비밀번호를 모두 입력해 주세요.");
      setIsSubmitting(false);
      return;
    }

    try {
      // 비밀번호는 Auth 시스템(signInWithPassword)으로 검증 (students 테이블이 아닌 Supabase Auth)
      const email = `${studentId}@temp.com`;
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setErrorMessage("학번 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      if (typeof window !== "undefined") {
        sessionStorage.setItem("student_id", studentId);
        // 로그인 성공 시점에 students 테이블에서 role을 다시 조회해 정확히 판단
        const { data: studentRow } = await supabase
          .from("students")
          .select("student_id, name, role")
          .eq("student_id", studentId)
          .maybeSingle();
        sessionStorage.setItem("student_name", studentRow?.name ?? "");
        const userRole = (studentRow?.role ?? "").trim().toLowerCase();
        console.log("현재 유저의 역할:", studentRow?.role ?? "(없음)", "→ 판단:", userRole || "(student)");
        if (userRole === "admin") {
          router.push("/admin");
        } else {
          router.push("/dashboard");
        }
      }
    } catch (err) {
      console.error("로그인 처리 중 예외:", err);
      setErrorMessage("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/logo.png"
            alt="영남신학대학교 로고"
            width={180}
            height={40}
            className="h-10 w-auto"
            priority
          />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            YOUNG SHINY 로그인
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            학번과 비밀번호를 입력해 주세요.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label
              htmlFor="studentId"
              className="block text-sm font-medium text-slate-700"
            >
              학번 (Student ID)
            </label>
            <input
              id="studentId"
              name="studentId"
              type="text"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder=""
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              비밀번호 (Password)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder=""
            />
            <p className="mt-1 text-xs text-slate-400">
              기본 비밀번호는 생년월일 6자리(예: 990101)입니다.
            </p>
          </div>

          {errorMessage && (
            <p className="text-xs font-medium text-red-500">{errorMessage}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>

          <div className="mt-3 flex justify-between text-xs text-slate-500">
            <Link
              href="/password-reset"
              className="text-blue-600 hover:text-blue-700 hover:underline"
            >
              비밀번호 변경하기
            </Link>
          </div>
        </form>

        <div className="mt-8 border-t border-slate-100 pt-4 text-center">
          <Link
            href="/"
            className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}



