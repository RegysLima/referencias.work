import { NextResponse } from "next/server";
import { discoverMediaCandidatesDetailed } from "@/lib/mediaDiscovery";

export const maxDuration = 120;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const referenceUrl = searchParams.get("url") || "";

  try {
    const result = await discoverMediaCandidatesDetailed(referenceUrl);
    return NextResponse.json({
      candidates: result.candidates.map((candidate) => candidate.url),
      details: result.candidates,
      discovery: {
        strategy: result.strategy,
        browserAttempted: result.browserAttempted,
        browserError: result.browserError || null,
      },
    });
  } catch {
    return NextResponse.json({ candidates: [], details: [] }, { status: 400 });
  }
}
