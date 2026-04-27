"use client";

import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  Home,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Sparkles,
  Trophy,
  User,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

const studentNav = [
  { label: "홈", href: "/", icon: Home },
  { label: "역량진단", href: "/diagnosis", icon: ClipboardCheck },
  { label: "교과목", href: "/courses", icon: BookOpen },
  { label: "교과목 로드맵", href: "/roadmap", icon: Map },
  { label: "비교과", href: "/extracurricular", icon: Trophy },
  { label: "AI진로가이드", href: "/ai-guide", icon: Sparkles },
  { label: "예약/신청", href: "/reservation", icon: Calendar },
  { label: "마이페이지", href: "/mypage", icon: User },
];

const adminNav = [
  { label: "관리자", href: "/admin", icon: LayoutDashboard },
];

export default function Navigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [myRole, setMyRole] = useState("");

  useEffect(() => {
    (async () => {
      const studentId = await getCurrentStudentId();
      if (!studentId?.trim()) return;
      setIsLoggedIn(true);
      const { data } = await supabase
        .from("students")
        .select("name, role")
        .eq("student_id", studentId.trim())
        .maybeSingle();
      if (data) {
        setUserName(data.name ?? "");
        const role = (data.role ?? "").trim().toLowerCase();
        setMyRole(role);
        if (role === "admin") {
          setIsAdmin(true);
        }
      }
    })();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("student_id");
      sessionStorage.removeItem("student_name");
    }
    router.push("/login");
  };

  // 학생이 아닌 역할은 각자 전용 페이지 헤더를 사용하므로 Navigation 숨김
  if (!isLoggedIn) return null;
  if (["admin", "ctl", "career_center", "counseling_center", "mentor_professor", "department_head", "staff"].includes(myRole)) return null;

  const navItems = [...studentNav, ...(isAdmin ? adminNav : [])];

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="YOUNG SHINY"
            width={140}
            height={32}
            className="h-8 w-auto"
          />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {userName && (
            <span className="hidden text-sm text-slate-600 sm:block">
              {userName}님
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="hidden items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-900 md:flex"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {isOpen && (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 flex w-full items-center gap-2 rounded-lg bg-slate-800 px-3 py-2.5 text-sm font-medium text-white hover:bg-slate-900"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      )}
    </nav>
  );
}
