"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function getLang(searchParams: URLSearchParams) {
  const fromUrl = searchParams.get("lang");
  if (fromUrl) return fromUrl;
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("rw_lang");
    if (stored) return stored;
  }
  return "pt";
}

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const lang = getLang(searchParams);
    const payload = JSON.stringify({ path: pathname, lang });
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/track", blob);
      return;
    }
    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => null);
  }, [pathname, searchParams]);

  return null;
}
