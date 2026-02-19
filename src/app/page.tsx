"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const handleStartClick = () => {
    router.push("/login");
  };

  const handleLoginClick = () => {
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      {/* Top Header (white) */}
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm sm:px-12 sm:py-5">
        <div className="flex items-center">
          <Image
            src="/logo.png"
            alt="영남신학대학교 로고"
            width={180}
            height={40}
            className="h-10 w-auto"
            priority
          />
        </div>
        <button
          type="button"
          onClick={handleLoginClick}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition hover:bg-black/85"
        >
          로그인
        </button>
      </header>

      {/* Middle Hero (image background only in this section) */}
      <main className="relative flex flex-1 items-center justify-center bg-black">
        {/* Hero background */}
        <div className="absolute inset-0">
          <Image
            src="/hero.png"
            alt="Young Shiny hero background"
            fill
            priority
            className="object-cover"
          />
        </div>

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/45" />

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center px-6 text-center sm:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            YOUNG SHINY
          </h1>
          <p className="mt-4 text-base font-medium text-white/85 sm:text-lg md:text-xl">
            빛나는 당신의 내일을 위한 나침반
          </p>
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={handleStartClick}
              className="rounded-full bg-blue-500 px-10 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/40 transition hover:bg-blue-600 hover:shadow-blue-600/50"
            >
              시작하기
            </button>
          </div>
        </div>
      </main>

      {/* Bottom Footer (white) */}
      <footer className="flex items-center justify-center bg-white px-4 py-4 sm:py-5">
        <p className="text-[10px] text-neutral-400 sm:text-[11px]">
          © 2026 GOSPEL BREWING COMPANY ALL RIGHTS RESERVED.
        </p>
      </footer>
    </div>
  );
}
