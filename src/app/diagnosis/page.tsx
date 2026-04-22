"use client";

import { ArrowRight, BookOpen, ClipboardList, Compass, GraduationCap, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Navigation from "@/components/Navigation";

const fixedCards = [
  {
    title: "핵심역량진단",
    description: "영성, 기독교적 성찰, 창의수행, 융합사고, 공감소통, 글로컬시민 역량을 진단합니다.",
    href: "/diagnosis/core",
    icon: Sparkles,
    iconBg: "bg-violet-50 text-violet-600",
  },
  {
    title: "학습역량진단",
    description: "LEARN 5가지 학습 역량(회복탄력성, DX역량, 상호작용, 메타인지, 공동체)을 점검합니다.",
    href: "/diagnosis/learning",
    icon: BookOpen,
    iconBg: "bg-blue-50 text-blue-600",
  },
  {
    title: "소명진단",
    description: "CALL+ 소명 5가지 역량(Calling, Awakening, Leading, Launching, Plus)을 탐색합니다.",
    href: "/diagnosis/calling",
    icon: Compass,
    iconBg: "bg-green-50 text-green-600",
  },
  {
    title: "전공역량진단",
    description: "학과별 전공역량(공통문항, 전공지식문항, SJT문항)을 진단합니다.",
    href: "/diagnosis/major",
    icon: GraduationCap,
    iconBg: "bg-orange-50 text-orange-600",
  },
];

const BUILTIN_KEYS = ["core_diagnosis", "learning_diagnosis", "calling_diagnosis", "major_competency_diagnosis"];

type DiagType = { key: string; label: string; description: string | null };

export default function DiagnosisPage() {
  const [customTypes, setCustomTypes] = useState<DiagType[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("diagnosis_types")
        .select("key, label, description")
        .eq("is_active", true)
        .order("sort_order");
      // 기본 3종 제외, 커스텀 유형만
      setCustomTypes((data ?? []).filter((d: DiagType) => !BUILTIN_KEYS.includes(d.key)));
    })();
  }, []);

  // 커스텀 유형에 문항이 있는지 확인하기 위해 assessment_questions 조회
  const [typesWithQuestions, setTypesWithQuestions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (customTypes.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("assessment_questions")
        .select("competency_type")
        .eq("is_active", true);
      const types = new Set((data ?? []).map((q: any) => q.competency_type));
      setTypesWithQuestions(types);
    })();
  }, [customTypes]);

  const visibleCustom = customTypes.filter((t) => typesWithQuestions.has(t.key));

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">역량진단</h1>
        <p className="mt-2 text-slate-600">아래 진단을 통해 나의 역량을 파악해보세요.</p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {fixedCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${card.iconBg}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">{card.title}</h2>
                <p className="mt-2 flex-1 text-sm text-slate-600">{card.description}</p>
                <span className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 group-hover:underline">
                  진단 시작하기 <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </Link>
            );
          })}

          {visibleCustom.map((ct) => (
            <Link
              key={ct.key}
              href="/diagnosis/custom"
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <ClipboardList className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">{ct.label}</h2>
              <p className="mt-2 flex-1 text-sm text-slate-600">{ct.description ?? "추가 역량진단"}</p>
              <span className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 group-hover:underline">
                진단 시작하기 <ArrowRight className="ml-1 h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
