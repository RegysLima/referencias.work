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

export async function GET() {
  if (!KV_ENABLED) {
    return NextResponse.json({ ok: false, error: "KV disabled" }, { status: 503 });
  }

  const summary =
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

  return NextResponse.json(summary);
}
