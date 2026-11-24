"use client";

import { ArrowRight, BookOpen, ClipboardList, Compass, GraduationCap, Sparkles } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { loadDiagnosisCards, type DiagnosisCard } from "@/lib/diagnosis-cards";
import Navigation from "@/components/Navigation";

/** 카드 겉모습. 목록과 순서는 diagnosis_types 가 정한다. */
const LOOK: Record<string, { icon: LucideIcon; iconBg: string }> = {
  core_diagnosis: { icon: Sparkles, iconBg: "bg-violet-50 text-violet-600" },
  learning_diagnosis: { icon: BookOpen, iconBg: "bg-blue-50 text-blue-600" },
  calling_diagnosis: { icon: Compass, iconBg: "bg-green-50 text-green-600" },
  major_competency_diagnosis: { icon: GraduationCap, iconBg: "bg-orange-50 text-orange-600" },
};
const DEFAULT_LOOK = { icon: ClipboardList, iconBg: "bg-amber-50 text-amber-600" };

export default function DiagnosisPage() {
  const [cards, setCards] = useState<DiagnosisCard[]>([]);

  useEffect(() => { void loadDiagnosisCards().then(setCards); }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">역량진단</h1>
        <p className="mt-2 text-slate-600">아래 진단을 통해 나의 역량을 파악해보세요.</p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const look = LOOK[card.key] ?? DEFAULT_LOOK;
            const Icon = look.icon;
            return (
              <Link
                key={card.key}
                href={card.href}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${look.iconBg}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">{card.label}</h2>
                <p className="mt-2 flex-1 text-sm text-slate-600">{card.description ?? "역량진단"}</p>
                <span className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 group-hover:underline">
                  진단 시작하기 <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
