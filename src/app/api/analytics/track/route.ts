import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const KV_KEY = "analytics:summary";
const KV_ENABLED = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);

type Summary = {
  total: number;
  refTotal?: number;
  byPath: Record<string, number>;
  byDay: Record<string, number>;
  byLang: Record<string, number>;
  byDayPath?: Record<string, Record<string, number>>;
  byDayLang?: Record<string, Record<string, number>>;
  byDayPathLang?: Record<string, Record<string, Record<string, number>>>;
  byRef?: Record<string, number>;
  byDayRef?: Record<string, Record<string, number>>;
  lastUpdated?: string;
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
  };
  const type = (body?.type || "page").toString().slice(0, 20);
  const path = (body?.path || "/").toString().slice(0, 200);
  const lang = normalizeLang((body?.lang || "pt").toString().slice(0, 24));
  const refName = (body?.refName || "").toString().slice(0, 200);
  const refUrl = (body?.refUrl || "").toString().slice(0, 400);

  const currentRaw = (await kv.get<Summary>(KV_KEY)) || {
    total: 0,
    byPath: {},
    byDay: {},
    byLang: {},
    byDayPath: {},
    byDayLang: {},
    byDayPathLang: {},
    byRef: {},
    byDayRef: {},
  };
  const current = normalizeSummaryLangs(currentRaw);

  const day = todayKey();
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
