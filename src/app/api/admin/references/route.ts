import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import fs from "node:fs";
import path from "node:path";
import type { Reference, ReferenceDB } from "@/lib/types";

const DB_PATH = path.join(process.cwd(), "public", "data", "references.json");
const KV_KEY = "references:db";
const KV_ENABLED = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);

async function readDb(): Promise<ReferenceDB> {
  if (KV_ENABLED) {
    const db = await kv.get<ReferenceDB>(KV_KEY);
    if (db) {
      return db;
    }
  }

  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const fileDb = JSON.parse(raw) as ReferenceDB;

  if (KV_ENABLED) {
    await kv.set(KV_KEY, fileDb);
  }

  return fileDb;
}
async function writeDb(db: ReferenceDB) {
  if (KV_ENABLED) {
    await kv.set(KV_KEY, db);
    return;
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export async function GET() {
  const db = await readDb();
  return NextResponse.json(db);
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { items?: Reference[] };
  const items = Array.isArray(body?.items) ? body.items : [];

  const db = await readDb();
  db.items = items;
  db.count = items.length;
  db.updatedAt = new Date().toISOString();

  await writeDb(db);
  return NextResponse.json({ ok: true });
}
