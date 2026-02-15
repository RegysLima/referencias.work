import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const KV_KEY = "analytics:summary";
const KV_ENABLED = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);

type Summary = {
  total: number;
  refTotal?: number;
  searchTotal?: number;
  byPath: Record<string, number>;
  byDay: Record<string, number>;
  byLang: Record<string, number>;
  byType?: Record<string, number>;
  byDayPath?: Record<string, Record<string, number>>;
  byDayLang?: Record<string, Record<string, number>>;
  byDayType?: Record<string, Record<string, number>>;
  byDayPathLang?: Record<string, Record<string, Record<string, number>>>;
  byRef?: Record<string, number>;
  byDayRef?: Record<string, Record<string, number>>;
  bySearchQuery?: Record<string, number>;
  byDaySearchQuery?: Record<string, Record<string, number>>;
  donation?: {
    cardView: number;
    pixClick: number;
    paypalClick: number;
    dismiss: number;
  };
  lastUpdated?: string | null;
};

type AnalyticsLang = "pt" | "es" | "en";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeLang(value: string | undefined): AnalyticsLang {
  const cleaned = (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z-]/g, "");

  if (cleaned.startsWith("pt")) return "pt";
  if (cleaned.startsWith("es")) return "es";
  if (cleaned.startsWith("en")) return "en";
  return "pt";
}

function normalizeLangMap(input: Record<string, number> | undefined) {
  const out: Record<AnalyticsLang, number> = { pt: 0, es: 0, en: 0 };
  const source = input || {};
  for (const [key, count] of Object.entries(source)) {
    const lang = normalizeLang(key);
    out[lang] = (out[lang] || 0) + (count || 0);
  }
  return out;
}

function normalizeByDayLang(
  input: Record<string, Record<string, number>> | undefined
) {
  const out: Record<string, Record<AnalyticsLang, number>> = {};
  const source = input || {};
  for (const [day, row] of Object.entries(source)) {
    out[day] = normalizeLangMap(row);
  }
  return out;
}

function normalizeByDayPathLang(
  input: Record<string, Record<string, Record<string, number>>> | undefined
) {
  const out: Record<string, Record<string, Record<AnalyticsLang, number>>> = {};
  const source = input || {};
  for (const [day, byPath] of Object.entries(source)) {
    out[day] = {};
    for (const [path, byLang] of Object.entries(byPath || {})) {
      out[day][path] = normalizeLangMap(byLang);
    }
  }
  return out;
}

function normalizeSummaryLangs(summary: Summary): Summary {
  return {
    ...summary,
    byLang: normalizeLangMap(summary.byLang),
    byDayLang: normalizeByDayLang(summary.byDayLang),
    byDayPathLang: normalizeByDayPathLang(summary.byDayPathLang),
  };
}

function normalizeType(value: string | undefined) {
  const cleaned = (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_:-]/g, "")
    .slice(0, 32);
  return cleaned || "page";
}

function normalizeSearchQuery(value: string | undefined) {
  const cleaned = (value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return cleaned;
}

export async function POST(req: Request) {
  if (!KV_ENABLED) {
    return NextResponse.json({ ok: false, error: "KV disabled" }, { status: 503 });
  }

  const body = (await req.json()) as {
    path?: string;
    lang?: string;
    type?: string;
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
    device?: string;
  };
  const type = normalizeType((body?.type || "page").toString());
  const path = (body?.path || "/").toString().slice(0, 200);
  const lang = normalizeLang((body?.lang || "pt").toString().slice(0, 24));
  const refName = (body?.refName || "").toString().slice(0, 200);
  const refUrl = (body?.refUrl || "").toString().slice(0, 400);
  const query = normalizeSearchQuery((body?.query || "").toString());
  const results = Number.isFinite(Number(body?.results)) ? Number(body?.results) : undefined;

  const currentRaw = (await kv.get<Summary>(KV_KEY)) || {
    total: 0,
    byPath: {},
    byDay: {},
    byLang: {},
    byType: {},
    byDayPath: {},
    byDayLang: {},
    byDayType: {},
    byDayPathLang: {},
    byRef: {},
    byDayRef: {},
    bySearchQuery: {},
    byDaySearchQuery: {},
    donation: {
      cardView: 0,
      pixClick: 0,
      paypalClick: 0,
      dismiss: 0,
    },
  };
  const current = normalizeSummaryLangs(currentRaw);
  current.byType = current.byType || {};
  current.byDayType = current.byDayType || {};
  current.bySearchQuery = current.bySearchQuery || {};
  current.byDaySearchQuery = current.byDaySearchQuery || {};
  current.donation = current.donation || { cardView: 0, pixClick: 0, paypalClick: 0, dismiss: 0 };

  const day = todayKey();
  current.byType[type] = (current.byType[type] || 0) + 1;
  current.byDayType[day] = current.byDayType[day] || {};
  current.byDayType[day][type] = (current.byDayType[day][type] || 0) + 1;

  if (type === "search") {
    current.searchTotal = (current.searchTotal || 0) + 1;
    if (query) {
      current.bySearchQuery[query] = (current.bySearchQuery[query] || 0) + 1;
      current.byDaySearchQuery[day] = current.byDaySearchQuery[day] || {};
      current.byDaySearchQuery[day][query] =
        (current.byDaySearchQuery[day][query] || 0) + 1;
    }
    if (typeof results === "number" && results <= 0) {
      const key = "search_no_results";
      current.byType[key] = (current.byType[key] || 0) + 1;
      current.byDayType[day][key] = (current.byDayType[day][key] || 0) + 1;
    }
  }

  if (type === "donation_card_view") current.donation.cardView += 1;
  if (type === "donation_pix_click") current.donation.pixClick += 1;
  if (type === "donation_paypal_click") current.donation.paypalClick += 1;
  if (type === "donation_card_dismiss") current.donation.dismiss += 1;

  if (type === "ref") {
    current.refTotal = (current.refTotal || 0) + 1;
    const key = refName || refUrl || "unknown";
    current.byRef = current.byRef || {};
    current.byDayRef = current.byDayRef || {};
    current.byRef[key] = (current.byRef[key] || 0) + 1;
    current.byDayRef[day] = current.byDayRef[day] || {};
    current.byDayRef[day][key] = (current.byDayRef[day][key] || 0) + 1;
  } else {
    current.total += 1;
    current.byPath[path] = (current.byPath[path] || 0) + 1;
    current.byDay[day] = (current.byDay[day] || 0) + 1;
    current.byLang[lang] = (current.byLang[lang] || 0) + 1;
    current.byDayPath = current.byDayPath || {};
    current.byDayLang = current.byDayLang || {};
    current.byDayPathLang = current.byDayPathLang || {};
    current.byDayPath[day] = current.byDayPath[day] || {};
    current.byDayPath[day][path] = (current.byDayPath[day][path] || 0) + 1;
    current.byDayLang[day] = current.byDayLang[day] || {};
    current.byDayLang[day][lang] = (current.byDayLang[day][lang] || 0) + 1;
    current.byDayPathLang[day] = current.byDayPathLang[day] || {};
    current.byDayPathLang[day][path] = current.byDayPathLang[day][path] || {};
    current.byDayPathLang[day][path][lang] =
      (current.byDayPathLang[day][path][lang] || 0) + 1;
  }
  current.lastUpdated = new Date().toISOString();

  await kv.set(KV_KEY, current);

  return NextResponse.json({ ok: true });
}
