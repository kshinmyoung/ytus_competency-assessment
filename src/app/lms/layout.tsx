"use client";

import { GraduationCap, Home, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Navigation from "@/components/Navigation";

const LMS_NAV = [
  { label: "학습 홈", href: "/lms", icon: GraduationCap },
];

const EXTERNAL_NAV = [
  { label: "비교과 신청", href: "/extracurricular", icon: Trophy },
  { label: "대시보드", href: "/dashboard", icon: Home },
];

/** /lms/[id]/watch/[cid] 는 몰입형이므로 헤더·사이드바를 걷어낸다. */
function isPlayerRoute(pathname: string): boolean {
  return /^\/lms\/[^/]+\/watch\/[^/]+/.test(pathname);
}

export default function LmsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isPlayerRoute(pathname)) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 전역 헤더는 그대로 유지한다 */}
      <Navigation />

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6">
        {/* LMS 전용 사이드바 */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-20 space-y-6">
            <div>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
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
                        isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-white hover:text-slate-900"
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
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                바로가기
              </p>
              <nav className="space-y-1">
                {EXTERNAL_NAV.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
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
