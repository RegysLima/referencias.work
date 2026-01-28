import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import type { Lang } from "@/lib/i18n";
import fs from "node:fs";
import path from "node:path";

type AboutContent = {
  title: Record<Lang, string>;
  body: Record<Lang, string>;
  sections?: Array<{
    id: string;
    title: Record<Lang, string>;
    body: Record<Lang, string>;
  }>;
  updatedAt?: string;
};

const DB_PATH = path.join(process.cwd(), "public", "data", "about.json");
const KV_KEY = "about:content";
const KV_ENABLED = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);

const LANGS: Lang[] = ["pt", "en", "es"];

function normalizeText(value: unknown): Record<Lang, string> {
  if (typeof value === "string") {
    return { pt: value, en: "", es: "" };
  }
  if (value && typeof value === "object") {
    const v = value as Partial<Record<Lang, string>>;
    return {
      pt: v.pt || "",
      en: v.en || "",
      es: v.es || "",
    };
  }
  return { pt: "", en: "", es: "" };
}

function normalizeSections(sections: unknown) {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((s, idx) => {
      const obj = s as { id?: string; title?: unknown; body?: unknown };
      const id = (obj?.id || `section-${idx}-${Date.now()}`).toString();
      return {
        id,
        title: normalizeText(obj?.title),
        body: normalizeText(obj?.body),
      };
    })
    .filter((s) => {
      const hasText = LANGS.some((lang) => s.title[lang] || s.body[lang]);
      return Boolean(s.id) && hasText;
    });
}

async function readAbout(): Promise<AboutContent> {
  if (KV_ENABLED) {
    const data = await kv.get<AboutContent>(KV_KEY);
    if (data) return data;
  }

  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const fileDb = JSON.parse(raw) as AboutContent;

  if (KV_ENABLED) {
    await kv.set(KV_KEY, fileDb);
  }

  return fileDb;
}

async function writeAbout(data: AboutContent) {
  const next = { ...data, updatedAt: new Date().toISOString() };

  if (KV_ENABLED) {
    await kv.set(KV_KEY, next);
    return;
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(next, null, 2), "utf-8");
}

export async function GET() {
  const about = await readAbout();
  return NextResponse.json(about);
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<AboutContent>;
  const title = normalizeText(body.title);
  const bodyText = normalizeText(body.body);
  const sections = normalizeSections(body.sections);
  const about = {
    title,
    body: bodyText,
    sections,
  };

  await writeAbout(about);
  return NextResponse.json({ ok: true });
}
