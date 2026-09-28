"use client";

import { GraduationCap, Home, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

const LMS_NAV = [
  { label: "학습 홈", href: "/lms", icon: GraduationCap },
];

/**
 * 자기 화면으로 돌아가는 길.
 * 학생이 아닌 역할은 전역 헤더(Navigation)가 숨겨져 있어서, 이 링크가 없으면
 * 영상 학습에 들어온 뒤 빠져나갈 방법이 없다.
 */
function homeFor(role: string): { label: string; href: string } {
  if (role === "professor" || role === "department_head") return { label: "교수 화면", href: "/professor" };
  if (["admin", "ctl", "career_center", "counseling_center"].includes(role)) return { label: "관리자 화면", href: "/admin" };
  if (role === "staff") return { label: "직원 화면", href: "/staff" };
  return { label: "대시보드", href: "/dashboard" };
}

/** /lms/[id]/watch/[cid] 는 몰입형이므로 헤더·사이드바를 걷어낸다. */
function isPlayerRoute(pathname: string): boolean {
  return /^\/lms\/[^/]+\/watch\/[^/]+/.test(pathname);
}

export default function LmsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // null = 아직 모름. 모르는 동안 기본값(학생 대시보드)을 그리면 교수가 그 틈에 눌러
  // 엉뚱한 화면으로 간다. 확정될 때까지 이 링크를 내지 않는다.
  const [myRole, setMyRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const studentId = await getCurrentStudentId();
      if (!studentId?.trim()) return;
      const { data } = await supabase
        .from("students").select("role").eq("student_id", studentId.trim()).maybeSingle();
      setMyRole((data?.role ?? "").trim().toLowerCase());
    })();
  }, []);

  const externalNav = [
    { label: "비교과 신청", href: "/extracurricular", icon: Trophy },
    ...(myRole === null ? [] : [{ ...homeFor(myRole), icon: Home }]),
  ];

  if (isPlayerRoute(pathname)) return <>{children}</>;

  return (
    <div className="min-h-screen bg-ys-paper">
      {/* 전역 헤더는 그대로 유지한다 */}
      <Navigation />

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6">
        {/* LMS 전용 사이드바 */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-20 space-y-6">
            <div>
              <p className="mb-2 px-3 text-[11px] font-semibold text-ys-ink-soft/80">
                영상 학습
              </p>
              <nav className="space-y-1">
                {LMS_NAV.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        isActive ? "bg-ys-blue/10 text-ys-blue" : "text-ys-ink-soft hover:bg-white hover:text-ys-ink"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div>
              <p className="mb-2 px-3 text-[11px] font-semibold text-ys-ink-soft/80">
                바로가기
              </p>
              <nav className="space-y-1">
                {externalNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ys-ink-soft transition hover:bg-white hover:text-ys-ink"
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
