"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import CompassRose from "@/components/CompassRose";
import YGlyph from "@/components/YGlyph";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
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
      // 이전 세션 강제 로그아웃
      await supabase.auth.signOut();

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
        // 이전 사용자 데이터 완전 초기화
        sessionStorage.clear();
        sessionStorage.setItem("student_id", studentId);

        // Auth 로그인 직후 토큰이 적용될 때까지 잠시 대기
        await new Promise((r) => setTimeout(r, 300));

        // role 조회 (여러 번 시도)
        let userRole = "";
        let studentName = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data: studentRow } = await supabase
            .from("students")
            .select("student_id, name, role")
            .eq("student_id", studentId)
            .maybeSingle();
          if (studentRow) {
            studentName = studentRow.name ?? "";
            userRole = (studentRow.role ?? "").trim().toLowerCase();
            break;
          }
          await new Promise((r) => setTimeout(r, 500));
        }

        sessionStorage.setItem("student_name", studentName);
        console.log("현재 유저의 역할:", userRole || "(student)");

        if (userRole === "admin") {
          window.location.href = "/admin";
        } else if (["ctl", "career_center", "counseling_center"].includes(userRole)) {
          window.location.href = "/admin/reservations";
        } else if (["department_head", "professor"].includes(userRole)) {
          window.location.href = "/professor";
        } else if (userRole === "staff") {
          window.location.href = "/staff";
        } else {
          window.location.href = "/dashboard";
        }
      }
    } catch (err) {
      console.error("로그인 처리 중 예외:", err);
      setErrorMessage("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass =
    "w-full rounded-lg border border-ys-navy-line bg-ys-navy-soft px-3.5 py-2.5 text-[15px] text-white " +
    "placeholder:text-ys-mist/45 outline-none transition " +
    "hover:border-ys-mist/45 focus:border-ys-gold";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-ys-navy px-5 py-10">
      {/* 배경은 계기판 같은 링만. 별과 광원을 넣으면 폼 글자가 묻힌다 */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 w-[900px] max-w-[190%] -translate-x-1/2 -translate-y-1/2 opacity-[0.28]"
        aria-hidden="true"
      >
        <CompassRose className="h-auto w-full" glow={false} star={false} />
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center">
        <div className="ys-rise w-full max-w-sm">
          <div className="flex flex-col items-center">
            <Link href="/" aria-label="홈으로">
              <Image
                src="/logo.png"
                alt="영남신학대학교"
                width={212}
                height={40}
                className="h-7 w-auto brightness-0 invert"
                priority
              />
            </Link>

            <p className="font-display mt-7 flex items-baseline text-[27px] font-black leading-[1.05] tracking-[-0.01em] text-white">
              <span className="sr-only">YOUNG SHINY</span>
              <span aria-hidden="true" className="flex items-baseline">
                <YGlyph className="h-[1.06em] w-[0.9em] shrink-0 text-ys-gold" />
                <span className="text-[0.87em]">OUNG</span>
                <span className="w-[0.24em]" />
                <span className="text-[0.87em]">SHIN</span>
                <YGlyph className="h-[1.06em] w-[0.9em] shrink-0 text-ys-gold" />
              </span>
            </p>
            <p className="mt-2.5 text-[13px] text-ys-mist">영남신학대학교 역량관리시스템</p>
          </div>

          <form onSubmit={handleLogin} className="mt-10 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="studentId" className="text-[13px] font-medium text-ys-mist">
                학번
              </label>
              <input
                id="studentId"
                name="studentId"
                type="text"
                required
                autoComplete="username"
                placeholder="예: 22406004"
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-[13px] font-medium text-ys-mist">
                비밀번호
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className={fieldClass}
              />
            </div>

            {errorMessage && (
              <p
                role="alert"
                className="rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300"
              >
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 rounded-full bg-ys-gold px-4 py-3.5 text-[15px] font-semibold text-ys-navy transition hover:bg-ys-light disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSubmitting ? "로그인 중..." : "로그인"}
            </button>
          </form>

          <div className="mt-7 flex items-center justify-center gap-5 text-[12.5px]">
            <Link href="/password-reset" className="text-ys-mist transition hover:text-ys-gold">
              비밀번호 변경
            </Link>
            <span className="h-3 w-px bg-ys-navy-line" aria-hidden="true" />
            <Link href="/" className="text-ys-mist transition hover:text-ys-gold">
              홈으로
            </Link>
          </div>
        </div>
      </div>

      <p className="relative z-10 mt-10 text-center text-[11.5px] leading-relaxed text-ys-mist/50">
        주의 말씀은 내 발에 등이요 내 길에 빛이니이다
        <span className="font-data ml-2 text-[10px] tracking-wide text-ys-mist/35">
          PSALM 119:105
        </span>
      </p>
    </div>
  );
}
