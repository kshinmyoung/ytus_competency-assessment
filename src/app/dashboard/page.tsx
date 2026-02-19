"use client";

import {
  ArrowRight,
  BookOpen,
  Compass,
  LogOut,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

const diagnosisCards = [
  {
    title: "핵심역량진단",
    description: "나의 핵심 역량을 파악합니다",
    href: "/diagnosis/core",
    icon: Sparkles,
    iconBg: "bg-blue-50 text-blue-600",
  },
  {
    title: "학습역량진단",
    description: "학습 스타일과 능력을 점검합니다",
    href: "/diagnosis/learning",
    icon: BookOpen,
    iconBg: "bg-blue-50 text-blue-600",
  },
  {
    title: "소명진단",
    description: "나의 소명과 진로를 탐색합니다",
    href: "/diagnosis/calling",
    icon: Compass,
    iconBg: "bg-blue-50 text-blue-600",
  },
];

const DEFAULT_USER_NAME = "학우";

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>(DEFAULT_USER_NAME);

  useEffect(() => {
    (async () => {
      const studentId = await getCurrentStudentId();
      if (!studentId?.trim()) {
        setUserName(DEFAULT_USER_NAME);
        return;
      }
      const { data, error } = await supabase
        .from("students")
        .select("name")
        .eq("student_id", studentId.trim())
        .maybeSingle();
      if (error || data?.name == null || String(data.name).trim() === "") {
        setUserName(DEFAULT_USER_NAME);
        return;
      }
      setUserName(String(data.name).trim());
      if (typeof window !== "undefined") {
        sessionStorage.setItem("student_name", String(data.name).trim());
      }
    })();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("student_name");
      sessionStorage.removeItem("student_id");
    }
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="YOUNG SHINY"
              width={140}
              height={32}
              className="h-8 w-auto"
            />
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-8 pt-2 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            환영합니다, {userName}님!
          </h1>
          <p className="mt-2 text-slate-600 sm:text-lg">
            오늘도 빛나는 내일을 위해 진단을 시작해보세요.
          </p>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {diagnosisCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-md transition-all duration-200 hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
              >
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${card.iconBg}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {card.title}
                </h2>
                <p className="mt-2 flex-1 text-sm text-slate-600">
                  {card.description}
                </p>
                <span className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 group-hover:underline">
                  진단 시작하기
                  <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
