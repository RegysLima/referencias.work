import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import fs from "node:fs";
import path from "node:path";

type AboutContent = {
  title: string;
  body: string;
  updatedAt?: string;
};

const DB_PATH = path.join(process.cwd(), "public", "data", "about.json");
const KV_KEY = "about:content";
const KV_ENABLED = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);

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
  const title = (body.title || "").trim() || "Sobre o projeto";
  const about = {
    title,
    body: (body.body || "").trim(),
  };

  await writeAbout(about);
  return NextResponse.json({ ok: true });
}
