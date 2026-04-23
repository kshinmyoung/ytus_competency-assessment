"use client";

import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Trophy,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

const ADMIN_TABS = [
  { label: "학생 관리", href: "/admin", icon: Users },
  { label: "교과목 관리", href: "/admin/courses", icon: BookOpen },
  { label: "비교과 관리", href: "/admin/extracurricular", icon: Trophy },
  { label: "진단 문항 관리", href: "/admin/assessment", icon: ClipboardCheck },
  { label: "응답 데이터", href: "/admin/assessment/results", icon: FileBarChart },
  { label: "멘토링 관리", href: "/admin/mentoring", icon: UserCheck },
  { label: "예약 관리", href: "/admin/reservations", icon: Calendar },
  { label: "통합 등록", href: "/admin/import", icon: Upload },
];

// 센터 직원은 필요한 메뉴만
const CENTER_TABS = [
  { label: "교과목", href: "/admin/courses", icon: BookOpen },
  { label: "비교과", href: "/admin/extracurricular", icon: Trophy },
  { label: "진단 문항", href: "/admin/assessment", icon: ClipboardCheck },
  { label: "응답 데이터", href: "/admin/assessment/results", icon: FileBarChart },
  { label: "예약 관리", href: "/admin/reservations", icon: Calendar },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "관리자",
  ctl: "교수학습지원센터",
  career_center: "취창업진로지원센터",
  counseling_center: "학생생활상담센터",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    (async () => {
      const studentId = await getCurrentStudentId();
      if (!studentId?.trim()) {
        router.replace("/");
        return;
      }
      const { data } = await supabase
        .from("students")
        .select("role")
        .eq("student_id", studentId.trim())
        .maybeSingle();
      const role = (data?.role ?? "").trim().toLowerCase();
      if (!["admin", "ctl", "career_center", "counseling_center"].includes(role)) {
        router.replace("/");
        return;
      }
      setUserRole(role);
      setAuthorized(true);
      // 센터 직원이 /admin 기본 페이지 접속 시 예약 관리로 이동
      if (role !== "admin" && window.location.pathname === "/admin") {
        router.replace("/admin/reservations");
      }
    })();
  }, [router]);

  const tabs = userRole === "admin" ? ADMIN_TABS : CENTER_TABS;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("student_id");
      sessionStorage.removeItem("student_name");
    }
    router.push("/login");
  };

  if (authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">확인 중...</p>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/admin" className="flex items-center gap-3">
            <Image src="/logo.png" alt="YOUNG SHINY" width={140} height={32} className="h-8 w-auto" />
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-white">{ROLE_LABELS[userRole] ?? userRole}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <LayoutDashboard className="h-4 w-4" />
              대시보드
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
          <div className="flex gap-1 py-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                tab.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
