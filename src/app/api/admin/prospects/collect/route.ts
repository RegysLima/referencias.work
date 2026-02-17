import { NextResponse } from "next/server";
import { collectProspectsMvp } from "@/lib/prospectsCollector";

export async function POST() {
  const result = await collectProspectsMvp();

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
