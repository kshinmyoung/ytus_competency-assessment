"use client";

import {
  BookOpen,
  Calendar,
  Coins,
  Gauge,
  MessageSquareText,
  FileBarChart,
  FileText,
  Film,
  LayoutDashboard,
  LogOut,
  Send,
  Trophy,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, waitForStudentId } from "@/lib/supabase";

const ADMIN_TABS = [
  { label: "통계 대시보드", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "학생 관리", href: "/admin", icon: Users },
  { label: "교과목 관리", href: "/admin/courses", icon: BookOpen },
  { label: "비교과 관리", href: "/admin/extracurricular", icon: Trophy },
  { label: "영상 LMS", href: "/admin/lms", icon: Film },
  { label: "진단 문항 관리", href: "/admin/assessment", icon: Gauge },
  { label: "응답 데이터", href: "/admin/assessment/results", icon: FileBarChart },
  { label: "멘토링 관리", href: "/admin/mentoring", icon: UserCheck },
  { label: "예약 관리", href: "/admin/reservations", icon: Calendar },
  { label: "리퍼럴", href: "/admin/referrals", icon: Send },
  { label: "상담기록", href: "/admin/counseling", icon: FileText },
  { label: "설문조사", href: "/admin/survey", icon: MessageSquareText },
  { label: "마일리지", href: "/staff", icon: Coins },
  { label: "통합 등록", href: "/admin/import", icon: Upload },
];

// 센터 직원은 필요한 메뉴만
const CENTER_TABS = [
  { label: "교과목", href: "/admin/courses", icon: BookOpen },
  { label: "비교과", href: "/admin/extracurricular", icon: Trophy },
  { label: "영상 LMS", href: "/admin/lms", icon: Film },
  { label: "진단 문항", href: "/admin/assessment", icon: Gauge },
  { label: "응답 데이터", href: "/admin/assessment/results", icon: FileBarChart },
  { label: "예약 관리", href: "/admin/reservations", icon: Calendar },
  { label: "리퍼럴", href: "/admin/referrals", icon: Send },
  { label: "상담기록", href: "/admin/counseling", icon: FileText },
  { label: "설문조사", href: "/admin/survey", icon: MessageSquareText },
];

// 직원은 영상 LMS 가 본업이다. 마일리지·설문조사만 곁들인다.
const STAFF_TABS = [
  { label: "영상 LMS", href: "/admin/lms", icon: Film },
  { label: "마일리지", href: "/staff", icon: Coins },
  { label: "설문조사", href: "/admin/survey", icon: MessageSquareText },
];

// 탭에서 감추는 것만으로는 주소를 직접 치면 열린다. 실제 차단은 아래 useEffect 가 한다.
const STAFF_ALLOWED_PATHS = STAFF_TABS.map((t) => t.href);

const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** 진도 현황만 교수에게 열어 준다. 같은 /admin/lms 아래의 목록·콘텐츠는 관리 권한이다. */
const LMS_PROGRESS_PATH = /^\/admin\/lms\/[^/]+\/progress$/;

// 교수·학과장의 본진은 /professor 다. /admin 에서는 리퍼럴과 진도 조회까지만 둔다.
// 진도 조회는 설계서 3장이 교수에게 준 권한이라 막지 않는다.
const PROFESSOR_SCOPE = {
  fallback: "/professor",
  allows: (pathname: string) => isUnder(pathname, "/admin/referrals") || LMS_PROGRESS_PATH.test(pathname),
};

/** 역할별 /admin 접근 범위. 여기에 없는 역할은 기존대로 둔다. */
const RESTRICTED_SCOPES: Record<string, { fallback: string; allows: (pathname: string) => boolean }> = {
  staff: {
    fallback: "/admin/lms",
    allows: (pathname) => STAFF_ALLOWED_PATHS.some((base) => isUnder(pathname, base)),
  },
  professor: PROFESSOR_SCOPE,
  department_head: PROFESSOR_SCOPE,
};

const ROLE_LABELS: Record<string, string> = {
  admin: "관리자",
  ctl: "교수학습지원센터",
  career_center: "취창업진로지원센터",
  counseling_center: "학생생활상담센터",
  staff: "직원",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    (async () => {
      // 세션 복원 전에 읽으면 정상 관리자도 홈으로 튕긴다. 복원될 때까지 기다린다.
      const studentId = await waitForStudentId();
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
      if (!["admin", "ctl", "career_center", "counseling_center", "professor", "department_head", "staff"].includes(role)) {
        router.replace("/");
        return;
      }
      setUserRole(role);
      setAuthorized(true);
      // 관리자가 아닌 역할이 /admin 기본 페이지로 들어오면 각자의 첫 화면으로 보낸다
      if (role !== "admin" && window.location.pathname === "/admin") {
        router.replace(RESTRICTED_SCOPES[role]?.fallback ?? "/admin/reservations");
      }
    })();
  }, [router]);

  // 메뉴에 없는 관리 화면은 주소를 직접 쳐도 열리지 않게 한다.
  // 레이아웃은 /admin 안에서 이동할 때 다시 마운트되지 않으므로 pathname 을 따로 본다.
  useEffect(() => {
    const scope = RESTRICTED_SCOPES[userRole];
    if (!scope || scope.allows(pathname)) return;
    router.replace(scope.fallback);
  }, [userRole, pathname, router]);

  const PROFESSOR_TABS = [
    { label: "리퍼럴", href: "/admin/referrals", icon: Send },
  ];

  const tabs = userRole === "admin"
    ? ADMIN_TABS
    : userRole === "staff"
      ? STAFF_TABS
      : ["professor", "department_head"].includes(userRole)
        ? PROFESSOR_TABS
        : CENTER_TABS;

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
      <div className="flex min-h-screen items-center justify-center bg-ys-paper">
        <p className="text-sm text-ys-ink-soft">확인 중...</p>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-ys-paper">
      {/*
        관리자 화면은 학생 화면과 같은 팔레트를 쓰되 나침반·히어로 같은 장식은 넣지 않는다.
        여기는 정체성을 보여주는 자리가 아니라 하루 종일 들여다보는 작업 도구다.
        브랜드는 네이비 헤더 한 줄로만 드러낸다.
      */}
      <header className="bg-ys-navy">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/admin" className="flex items-center gap-3">
            {/* 어두운 배경이라 원본 파란 로고를 흰색 단색으로 바꾼다 */}
            <Image src="/logo.png" alt="YOUNG SHINY" width={212} height={40} className="h-8 w-auto brightness-0 invert" />
            <span className="rounded-full border border-ys-gold/40 px-2.5 py-0.5 text-xs font-medium text-ys-gold">
              {ROLE_LABELS[userRole] ?? userRole}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ys-mist transition hover:text-white"
            >
              <LayoutDashboard className="h-4 w-4" />
              대시보드
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-ys-navy-line px-3 py-2 text-sm font-medium text-ys-mist transition hover:border-ys-gold hover:text-ys-gold"
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
                      ? "bg-ys-blue/10 text-ys-blue"
                      : "text-ys-ink-soft hover:bg-ys-paper hover:text-ys-ink"
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
