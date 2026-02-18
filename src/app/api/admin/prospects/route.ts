import { NextResponse } from "next/server";
import type { ProspectItem } from "@/lib/types";
import { readProspectsDb, writeProspectsDb } from "@/lib/prospectsDb";
import { readReferencesDb, writeReferencesDb } from "@/lib/referencesDb";

function normalizeUrlKey(value: string) {
  try {
    const url = new URL((value || "").trim());
    const path = url.pathname.replace(/\/+$/, "");
    url.hash = "";
    url.search = "";
    return `${url.protocol}//${url.host}${path}`.toLowerCase();
  } catch {
    return (value || "").trim().toLowerCase();
  }
}

function toPrefillReference(prospect: ProspectItem) {
  const now = new Date().toISOString();
  const fallbackUrl = prospect.domain ? `https://${prospect.domain}` : "";
  const url = (prospect.homepageUrl || fallbackUrl).trim();
  const name = (prospect.displayName || prospect.domain || "Nova referência").trim();
  const uid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

  return {
    id: `prospect-${prospect.id}-${uid}`,
    name,
    url,
    type: "Studios",
    macroType: "Studios",
    areaPrimary: "",
    areasSecondary: [],
    tags: [],
    country: null,
    city: null,
    locations: [],
    thumbnailUrl: null,
    thumbnailSource: "manual",
    hidden: false,
    updatedAt: now,
    reviewedAt: null,
  };
}

async function syncApprovedProspectsToReferences(prospects: ProspectItem[]) {
  const approved = prospects.filter((item) => item.status === "approved");
  if (!approved.length) return;

  const refDb = await readReferencesDb();
  const existingUrlKeys = new Set(refDb.items.map((item) => normalizeUrlKey(item.url)));
  let changed = false;

  for (const item of approved) {
    const candidate = toPrefillReference(item);
    const key = normalizeUrlKey(candidate.url);
    if (!key || key === "https://") continue;
    if (existingUrlKeys.has(key)) continue;
    existingUrlKeys.add(key);
    refDb.items = [candidate, ...refDb.items];
    changed = true;
  }

  if (!changed) return;
  refDb.count = refDb.items.length;
  refDb.updatedAt = new Date().toISOString();
  await writeReferencesDb(refDb);
}

export async function GET() {
  const db = await readProspectsDb();
  await syncApprovedProspectsToReferences(db.items);
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

  const isValidStatus =
    status === "new" || status === "waiting" || status === "approved" || status === "rejected";
  if (hasStatus && !isValidStatus) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const db = await readProspectsDb();
  let found = false;
  let approvedItem: ProspectItem | null = null;

  if (status === "rejected") {
    const next = db.items.filter((item) => {
      if (item.id === id) {
        found = true;
        return false;
      }
      return true;
    });
    db.items = next;
  } else {
    db.items = db.items.map((item) => {
      if (item.id !== id) return item;
      found = true;
      if (status === "approved") approvedItem = item;
      return {
        ...item,
        status: hasStatus ? (status as ProspectItem["status"]) : item.status,
        notes: hasNotes ? (notes || null) : item.notes || null,
      };
    });
  }

  if (!found) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  db.count = db.items.length;
  db.updatedAt = new Date().toISOString();
  await writeProspectsDb(db);

  if (status === "approved" && approvedItem) {
    await syncApprovedProspectsToReferences([approvedItem]);
  }

  return NextResponse.json({ ok: true });
}
