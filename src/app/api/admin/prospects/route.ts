import { NextResponse } from "next/server";
import type { ProspectItem } from "@/lib/types";
import { readProspectsDb, writeProspectsDb } from "@/lib/prospectsDb";

export async function GET() {
  const db = await readProspectsDb();
  return NextResponse.json(db);
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    status?: ProspectItem["status"];
    notes?: string | null;
  };

  const id = (body.id || "").trim();
  const status = body.status;
  const notes = body.notes;

  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const hasStatus = typeof status === "string";
  const hasNotes = typeof notes === "string" || notes === null;

  if (!hasStatus && !hasNotes) {
    return NextResponse.json({ ok: false, error: "no_changes" }, { status: 400 });
  }

  const isValidStatus = status === "new" || status === "approved" || status === "rejected";
  if (hasStatus && !isValidStatus) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const db = await readProspectsDb();
  let found = false;

  db.items = db.items.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return {
      ...item,
      status: hasStatus ? (status as ProspectItem["status"]) : item.status,
      notes: hasNotes ? (notes || null) : item.notes || null,
    };
  });

  if (!found) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  db.count = db.items.length;
  db.updatedAt = new Date().toISOString();
  await writeProspectsDb(db);

  return NextResponse.json({ ok: true });
}
