import fs from "node:fs";
import path from "node:path";
import { kv } from "@vercel/kv";
import type { Lang } from "@/lib/i18n";

export type AboutContent = {
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

function normalizeAbout(input: unknown): AboutContent {
  const parsed = input as {
    title?: unknown;
    body?: unknown;
    sections?: unknown;
    updatedAt?: string;
  };
  return {
    title: normalizeText(parsed?.title),
    body: normalizeText(parsed?.body),
    sections: normalizeSections(parsed?.sections),
    updatedAt: parsed?.updatedAt,
  };
}

export async function loadAbout(): Promise<AboutContent> {
  if (KV_ENABLED) {
    const db = await kv.get<AboutContent>(KV_KEY);
    if (db) {
      const normalized = normalizeAbout(db);
      return normalized;
    }
  }

  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  const fileDb = normalizeAbout(parsed);

  if (KV_ENABLED) {
    await kv.set(KV_KEY, fileDb);
  }

  return fileDb;
}
