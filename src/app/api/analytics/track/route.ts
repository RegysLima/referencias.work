import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const KV_KEY = "analytics:summary";
const KV_ENABLED = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);

type Summary = {
  total: number;
  byPath: Record<string, number>;
  byDay: Record<string, number>;
  byLang: Record<string, number>;
  lastUpdated?: string;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  if (!KV_ENABLED) {
    return NextResponse.json({ ok: false, error: "KV disabled" }, { status: 503 });
  }

  const body = (await req.json()) as {
    path?: string;
    lang?: string;
  };
  const path = (body?.path || "/").toString().slice(0, 200);
  const lang = (body?.lang || "pt").toString().slice(0, 10);

  const current = (await kv.get<Summary>(KV_KEY)) || {
    total: 0,
    byPath: {},
    byDay: {},
    byLang: {},
  };

  current.total += 1;
  current.byPath[path] = (current.byPath[path] || 0) + 1;
  const day = todayKey();
  current.byDay[day] = (current.byDay[day] || 0) + 1;
  current.byLang[lang] = (current.byLang[lang] || 0) + 1;
  current.lastUpdated = new Date().toISOString();

  await kv.set(KV_KEY, current);

  return NextResponse.json({ ok: true });
}
