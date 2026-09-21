import { NextResponse } from "next/server";
import { runMediaMaintenance } from "@/lib/mediaMaintenance";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const requestedLimit = Number(url.searchParams.get("limit") || "0");
  const scanLimit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 100)
    : undefined;

  try {
    const result = await runMediaMaintenance({
      source: req.headers.get("x-vercel-cron") === "1" ? "cron" : "manual",
      origin: process.env.NEXT_PUBLIC_SITE_URL || "https://referencias.work",
      dryRun,
      scanLimit,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "media_maintenance_failed";
    const status = message === "media_maintenance_already_running" ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
