import fs from "node:fs";
import path from "node:path";
import { kv } from "@vercel/kv";

export type AboutContent = {
  title: string;
  body: string;
  updatedAt?: string;
};

const DB_PATH = path.join(process.cwd(), "public", "data", "about.json");
const KV_KEY = "about:content";
const KV_ENABLED = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);

export async function loadAbout(): Promise<AboutContent> {
  if (KV_ENABLED) {
    const db = await kv.get<AboutContent>(KV_KEY);
    if (db) {
      return db;
    }
  }

  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const fileDb = JSON.parse(raw) as AboutContent;

  if (KV_ENABLED) {
    await kv.set(KV_KEY, fileDb);
  }

  return fileDb;
}
