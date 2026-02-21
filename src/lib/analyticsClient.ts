"use client";

type EventPayload = {
  type: string;
  path?: string;
  lang?: string;
  refName?: string;
  refUrl?: string;
  query?: string;
  filter?: string;
  value?: string;
  results?: number;
  sessionId?: string;
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  referrer?: string;
  device?: "mobile" | "desktop";
  x?: number;
  y?: number;
  vw?: number;
  vh?: number;
  sy?: number;
  dh?: number;
};

const SESSION_KEY = "rw_session_id";

function makeSessionId() {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `rw_${Date.now().toString(36)}_${rnd}`;
}

function getSessionId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = makeSessionId();
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return "";
  }
}

function getUtm(search: string) {
  try {
    const params = new URLSearchParams(search);
    return {
      utmSource: params.get("utm_source") || "",
      utmCampaign: params.get("utm_campaign") || "",
      utmMedium: params.get("utm_medium") || "",
    };
  } catch {
    return { utmSource: "", utmCampaign: "", utmMedium: "" };
  }
}

function getDevice(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  return window.matchMedia("(max-width: 1023px)").matches ? "mobile" : "desktop";
}

export function sendAnalyticsEvent(payload: EventPayload) {
  try {
    const path = payload.path || (typeof window !== "undefined" ? window.location.pathname : "/");
    const search = typeof window !== "undefined" ? window.location.search : "";
    const utm = getUtm(search);
    const fullPayload = JSON.stringify({
      ...payload,
      path,
      sessionId: payload.sessionId || getSessionId(),
      referrer: payload.referrer || (typeof document !== "undefined" ? document.referrer || "" : ""),
      device: payload.device || getDevice(),
      utmSource: payload.utmSource || utm.utmSource,
      utmCampaign: payload.utmCampaign || utm.utmCampaign,
      utmMedium: payload.utmMedium || utm.utmMedium,
    });

    const blob = new Blob([fullPayload], { type: "application/json" });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/track", blob);
      return;
    }
    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: fullPayload,
      keepalive: true,
    }).catch(() => null);
  } catch {
    // ignore
  }
}
