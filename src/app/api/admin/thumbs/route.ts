import { NextResponse } from "next/server";
import { discoverMediaCandidates } from "@/lib/mediaDiscovery";

export const maxDuration = 120;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const referenceUrl = searchParams.get("url") || "";

  try {
    const candidates = await discoverMediaCandidates(referenceUrl);
    return NextResponse.json({ candidates: candidates.map((candidate) => candidate.url) });
  } catch {
    return NextResponse.json({ candidates: [] }, { status: 400 });
  }
}
