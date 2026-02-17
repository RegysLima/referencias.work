import { NextResponse } from "next/server";
import type { Reference } from "@/lib/types";
import { readReferencesDb, writeReferencesDb } from "@/lib/referencesDb";

export async function GET() {
  const db = await readReferencesDb();
  return NextResponse.json(db);
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { items?: Reference[] };
  const items = Array.isArray(body?.items) ? body.items : [];

  const db = await readReferencesDb();
  db.items = items;
  db.count = items.length;
  db.updatedAt = new Date().toISOString();

  await writeReferencesDb(db);
  return NextResponse.json({ ok: true });
}
