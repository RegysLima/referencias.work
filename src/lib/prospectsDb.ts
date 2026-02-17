import fs from "node:fs";
import path from "node:path";
import { kv } from "@vercel/kv";
import type { ProspectsDB } from "@/lib/types";

const DB_PATH = path.join(process.cwd(), "public", "data", "prospects.json");
const KV_KEY = "prospects:db";
const KV_ENABLED = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const EMPTY_DB: ProspectsDB = {
  count: 0,
  items: [],
  updatedAt: null,
  lastRun: null,
};

function ensureLocalDbFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2), "utf-8");
  }
}

export async function readProspectsDb(): Promise<ProspectsDB> {
  if (KV_ENABLED) {
    const db = await kv.get<ProspectsDB>(KV_KEY);
    if (db) {
      return {
        count: Array.isArray(db.items) ? db.items.length : 0,
        items: Array.isArray(db.items) ? db.items : [],
        updatedAt: db.updatedAt || null,
        lastRun: db.lastRun || null,
      };
    }
  }

  ensureLocalDbFile();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const parsed = JSON.parse(raw) as ProspectsDB;

  const db: ProspectsDB = {
    count: Array.isArray(parsed.items) ? parsed.items.length : 0,
    items: Array.isArray(parsed.items) ? parsed.items : [],
    updatedAt: parsed.updatedAt || null,
    lastRun: parsed.lastRun || null,
  };

  if (KV_ENABLED) {
    await kv.set(KV_KEY, db);
  }

  return db;
}

export async function writeProspectsDb(db: ProspectsDB) {
  const normalized: ProspectsDB = {
    ...db,
    count: Array.isArray(db.items) ? db.items.length : 0,
    items: Array.isArray(db.items) ? db.items : [],
    updatedAt: db.updatedAt || null,
    lastRun: db.lastRun || null,
  };

  if (KV_ENABLED) {
    await kv.set(KV_KEY, normalized);
    return;
  }

  ensureLocalDbFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(normalized, null, 2), "utf-8");
}
