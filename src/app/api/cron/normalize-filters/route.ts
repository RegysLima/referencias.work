import { NextResponse } from "next/server";
import { normalizeReferenceDb } from "@/lib/referenceNormalization";
import { readReferencesDb, writeReferencesDb } from "@/lib/referencesDb";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const vercelCron = req.headers.get("x-vercel-cron") === "1";

  if (secret) {
    return auth === `Bearer ${secret}`;
  }

  if (vercelCron) return true;

  try {
    const host = new URL(req.url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = await readReferencesDb();
  const { db: normalizedDb, stats } = normalizeReferenceDb(db);

  if (stats.changedItems > 0) {
    await writeReferencesDb(normalizedDb);
  }

  return NextResponse.json({
    ok: true,
    normalized: stats.changedItems > 0,
    total: stats.total,
    changedItems: stats.changedItems,
    updatedAt: normalizedDb.updatedAt || null,
    ranAt: new Date().toISOString(),
  });
}
