"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import CompassRose from "@/components/CompassRose";
import YGlyph from "@/components/YGlyph";

export default function Home() {
  const router = useRouter();
  const goLogin = () => router.push("/login");

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-ys-navy">
      {/*
        로고 원본(public/logo.png)은 파란 단색이라 어두운 배경에서 대비가 나오지 않는다.
        이미지를 새로 만들지 않고 brightness-0 → invert 로 흰색 단색으로 바꾼다.
        밝은 배경 화면에서는 이 두 클래스만 빼면 원본 파란 로고로 돌아간다.
      */}
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-10">
        <Image
          src="/logo.png"
          alt="영남신학대학교"
          width={212}
          height={40}
          className="h-7 w-auto shrink-0 brightness-0 invert sm:h-9"
          priority
        />
        <button
          type="button"
          onClick={goLogin}
          className="shrink-0 rounded-full border border-ys-navy-line px-4 py-2 text-sm font-medium text-ys-mist transition hover:border-ys-gold hover:text-ys-gold sm:px-5"
        >
          로그인
        </button>
      </header>

      <main className="flex flex-1 items-center">
        <div className="mx-auto flex w-full max-w-7xl flex-col-reverse items-center gap-10 px-6 py-14 sm:px-10 sm:py-20 lg:flex-row lg:gap-6 lg:py-24">
          {/* 문구 */}
          <div className="ys-rise w-full min-w-0 lg:flex-1">
            <p className="font-data text-[13px] font-medium tracking-[0.26em] text-ys-gold sm:text-[15px] sm:tracking-[0.3em]">
              Y-COMPASS 2030
            </p>

            {/* 워드마크 — 두 개의 Y 는 로고 심볼의 Y 형태를 쓴다 */}
            <h1 className="font-display mt-3 flex items-baseline text-[40px] font-black leading-[1.05] tracking-[-0.01em] text-white sm:mt-4 sm:text-[58px] lg:text-[68px]">
              <span className="sr-only">YOUNG SHINY</span>
              <span aria-hidden="true" className="flex items-baseline">
                <YGlyph className="h-[1.06em] w-[0.9em] shrink-0 text-ys-gold" />
                <span className="text-[0.87em]">OUNG</span>
                <span className="w-[0.24em]" />
                <span className="text-[0.87em]">SHIN</span>
                <YGlyph className="h-[1.06em] w-[0.9em] shrink-0 text-ys-gold" />
              </span>
            </h1>

            <p className="mt-5 text-[15px] tracking-[0.01em] text-ys-mist sm:mt-6 sm:text-[17px]">
              영남신학대학교 역량관리시스템
            </p>

            <div className="mt-9 sm:mt-11">
              <button
                type="button"
                onClick={goLogin}
                className="rounded-full bg-ys-gold px-8 py-3.5 text-[15px] font-semibold text-ys-navy transition hover:bg-ys-light"
              >
                시작하기
              </button>
            </div>
          </div>

          {/* 나침반 — 겹치지 않도록 별도 열로 둔다 */}
          <div className="ys-bloom flex w-full min-w-0 justify-center lg:flex-1">
            <CompassRose className="h-auto w-52 max-w-full sm:w-72 lg:w-full lg:max-w-[520px]" />
          </div>
        </div>
      </main>

      <footer className="border-t border-ys-navy-line/60 px-6 py-6 sm:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="text-[11.5px] leading-relaxed text-ys-mist/55">
            주의 말씀은 내 발에 등이요 내 길에 빛이니이다
            <span className="font-data ml-2 text-[10px] tracking-wide text-ys-mist/40">
              PSALM 119:105
            </span>
          </p>
          <p className="font-data text-[10px] tracking-wide text-ys-mist/40">
            © 2026 GOSPEL BREWING COMPANY ALL RIGHTS RESERVED.
          </p>
        </div>
      </footer>
    </div>
  );
}
