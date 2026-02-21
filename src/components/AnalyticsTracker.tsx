"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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

function getLang(searchParams: URLSearchParams) {
  const fromUrl = searchParams.get("lang");
  if (fromUrl) return normalizeLang(fromUrl);
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("rw_lang");
    if (stored) return normalizeLang(stored);
  }
  return "pt";
}

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const lang = getLang(searchParams);
    sendAnalyticsEvent({ type: "page", path: pathname, lang });
  }, [pathname, searchParams]);

  useEffect(() => {
    if (pathname !== "/") return;

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
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [pathname]);

  return null;
}
