import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import {
  NORMALIZE_FILTERS_STATUS_KEY,
  type NormalizeFiltersStatus,
} from "@/lib/maintenance";

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
  byNoResultQuery?: Record<string, number>;
  byDayNoResultQuery?: Record<string, Record<string, number>>;
  byCountry?: Record<string, number>;
  byCity?: Record<string, number>;
  byDevice?: Record<string, number>;
  byDayCountry?: Record<string, Record<string, number>>;
  byDayCity?: Record<string, Record<string, number>>;
  byDayDevice?: Record<string, Record<string, number>>;
  donation?: {
    cardView: number;
    pixClick: number;
    paypalClick: number;
    dismiss: number;
  };
  heatmapHome?: Record<string, number>;
  heatmapHomeByDevice?: {
    desktop: Record<string, number>;
    mobile: Record<string, number>;
  };
  heatmapHomeV2?: Record<string, number>;
  heatmapHomeByDeviceV2?: {
    desktop: Record<string, number>;
    mobile: Record<string, number>;
  };
  normalizeFilters?: NormalizeFiltersStatus | null;
  lastUpdated?: string | null;
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
    byType: summary.byType || {},
    byDayType: summary.byDayType || {},
    bySearchQuery: summary.bySearchQuery || {},
    byDaySearchQuery: summary.byDaySearchQuery || {},
    byNoResultQuery: summary.byNoResultQuery || {},
    byDayNoResultQuery: summary.byDayNoResultQuery || {},
    byCountry: summary.byCountry || {},
    byCity: summary.byCity || {},
    byDevice: summary.byDevice || {},
    byDayCountry: summary.byDayCountry || {},
    byDayCity: summary.byDayCity || {},
    byDayDevice: summary.byDayDevice || {},
    donation: summary.donation || {
      cardView: 0,
      pixClick: 0,
      paypalClick: 0,
      dismiss: 0,
    },
    heatmapHome: summary.heatmapHome || {},
    heatmapHomeByDevice: summary.heatmapHomeByDevice || {
      desktop: {},
      mobile: {},
    },
    heatmapHomeV2: summary.heatmapHomeV2 || {},
    heatmapHomeByDeviceV2: summary.heatmapHomeByDeviceV2 || {
      desktop: {},
      mobile: {},
    },
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
      byType: {},
      byDayPath: {},
      byDayLang: {},
      byDayType: {},
      byDayPathLang: {},
      byRef: {},
      byDayRef: {},
      bySearchQuery: {},
      byDaySearchQuery: {},
      byNoResultQuery: {},
      byDayNoResultQuery: {},
      byCountry: {},
      byCity: {},
      byDevice: {},
      byDayCountry: {},
      byDayCity: {},
      byDayDevice: {},
      donation: {
        cardView: 0,
        pixClick: 0,
        paypalClick: 0,
        dismiss: 0,
      },
      heatmapHome: {},
      heatmapHomeByDevice: {
        desktop: {},
        mobile: {},
      },
      heatmapHomeV2: {},
      heatmapHomeByDeviceV2: {
        desktop: {},
        mobile: {},
      },
      normalizeFilters: null,
      lastUpdated: null,
    };
  const summary = normalizeSummaryLangs(summaryRaw);
  const normalizeFilters =
    (await kv.get<NormalizeFiltersStatus>(NORMALIZE_FILTERS_STATUS_KEY)) || null;
  summary.normalizeFilters = normalizeFilters;

  if (JSON.stringify(summary) !== JSON.stringify(summaryRaw)) {
    await kv.set(KV_KEY, summary);
  }

  return NextResponse.json(summary);
}
