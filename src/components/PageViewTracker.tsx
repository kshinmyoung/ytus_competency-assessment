"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { waitForAccessToken } from "@/lib/supabase";

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
    const referrer = typeof document !== "undefined" ? document.referrer || null : null;

    /**
     * 학번은 body 에 담지 않는다. 액세스 토큰만 보내고 서버가 토큰에서 꺼낸다.
     * 전에는 sessionStorage 의 학번을 읽어 보냈는데, 로그인 화면을 거치지 않고
     * 새 탭으로 들어오면 그 값이 비어 방문이 익명으로 남았다. 전체 방문의 39%,
     * 영상 시청 방문 133건이 누구 것인지 알 수 없게 돼 진도 유실을 확인할 때
     * 사람을 특정하지 못했다. sendBeacon 은 헤더를 붙일 수 없어 fetch 로 보낸다.
     */
    void (async () => {
      const token = await waitForAccessToken();
      try {
        await fetch("/api/track-visit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ path: pathname, session_id, referrer }),
          keepalive: true,
        });
      } catch {
        // 트래킹 실패는 사용자 경험을 방해하지 않음
      }
    })();
  }, [pathname]);

  return null;
}
