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

export async function GET() {
  if (!KV_ENABLED) {
    return NextResponse.json({ ok: false, error: "KV disabled" }, { status: 503 });
  }

  const summaryRaw =
    (await kv.get<Summary>(KV_KEY)) || {
      total: 0,
      byPath: {},
      byDay: {},
      byLang: {},
      byDayPath: {},
      byDayLang: {},
      byDayPathLang: {},
      byRef: {},
      byDayRef: {},
      lastUpdated: null,
    };
  const summary = normalizeSummaryLangs(summaryRaw);

  if (JSON.stringify(summary) !== JSON.stringify(summaryRaw)) {
    await kv.set(KV_KEY, summary);
  }

  return NextResponse.json(summary);
}
