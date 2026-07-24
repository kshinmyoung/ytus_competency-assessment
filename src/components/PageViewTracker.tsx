"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const key = "yp_session_id";
    let sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(key, sid);
    }
    return sid;
  } catch {
    return "";
  }
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/api") || pathname.startsWith("/_next")) return;
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;

    const session_id = getOrCreateSessionId();
    let student_id: string | null = null;
    try {
      student_id = sessionStorage.getItem("student_id");
    } catch {
      student_id = null;
    }
    const referrer = typeof document !== "undefined" ? document.referrer || null : null;

    const payload = JSON.stringify({ path: pathname, session_id, student_id, referrer });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/track-visit", blob);
      } else {
        fetch("/api/track-visit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // 트래킹 실패는 사용자 경험을 방해하지 않음
    }
  }, [pathname]);

  return null;
}
