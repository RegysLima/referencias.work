import fs from "node:fs";
import path from "node:path";
import { kv } from "@vercel/kv";
import type { ReferenceDB } from "@/lib/types";

const DB_PATH = path.join(process.cwd(), "public", "data", "references.json");
const KV_KEY = "references:db";
const KV_ENABLED = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export async function readReferencesDb(): Promise<ReferenceDB> {
  if (KV_ENABLED) {
    const db = await kv.get<ReferenceDB>(KV_KEY);
    if (db) return db;
  }

  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const fileDb = JSON.parse(raw) as ReferenceDB;

  if (KV_ENABLED) {
    await kv.set(KV_KEY, fileDb);
  }

  return fileDb;
}

export async function writeReferencesDb(db: ReferenceDB) {
  if (KV_ENABLED) {
    await kv.set(KV_KEY, db);
    return;
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}
