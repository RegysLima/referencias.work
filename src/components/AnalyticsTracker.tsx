"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sendAnalyticsEvent } from "@/lib/analyticsClient";

function normalizeLang(value: string | null | undefined) {
  const cleaned = (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z-]/g, "");

  if (cleaned.startsWith("pt")) return "pt";
  if (cleaned.startsWith("es")) return "es";
  if (cleaned.startsWith("en")) return "en";
  return "pt";
}

function getLang() {
  if (typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (fromUrl) return normalizeLang(fromUrl);

    const stored = window.localStorage.getItem("rw_lang");
    if (stored) return normalizeLang(stored);
  }

  return "pt";
}

function getPath(pathname: string | null) {
  if (pathname) return pathname;
  if (typeof window !== "undefined") return window.location.pathname || "/";
  return "/";
}

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    sendAnalyticsEvent({ type: "page", path: getPath(pathname), lang: getLang() });
  }, [pathname]);

  useEffect(() => {
    if (getPath(pathname) !== "/") return;

    let lastAt = 0;
    let lastX = -9999;
    let lastY = -9999;

    const onMove = (event: MouseEvent) => {
      const now = Date.now();
      if (now - lastAt < 1200) return;
      if (Math.abs(event.clientX - lastX) + Math.abs(event.clientY - lastY) < 28) return;

      const vw = Math.max(window.innerWidth || 0, 1);
      const vh = Math.max(window.innerHeight || 0, 1);
      const sy = Math.max(window.scrollY || window.pageYOffset || 0, 0);
      const root = document.documentElement;
      const body = document.body;
      const dh = Math.max(
        root?.scrollHeight || 0,
        body?.scrollHeight || 0,
        root?.offsetHeight || 0,
        body?.offsetHeight || 0,
        vh
      );
      const footer = document.querySelector("footer");
      const ch = footer ? Math.max(footer.getBoundingClientRect().bottom + sy, vh) : dh;

      lastAt = now;
      lastX = event.clientX;
      lastY = event.clientY;

      sendAnalyticsEvent({
        type: "mouse_move_home",
        path: "/",
        x: event.clientX,
        y: event.clientY,
        vw,
        vh,
        sy,
        dh,
        ch,
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [pathname]);

  return null;
}
