import { NextResponse } from "next/server";
import {
  getProspectsCollectionStatus,
  runProspectsCollectionStep,
  startProspectsCollection,
} from "@/lib/prospectsCollector";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = (body.action || "step").toLowerCase();

  const result =
    action === "start"
      ? await startProspectsCollection()
      : action === "status"
      ? await getProspectsCollectionStatus()
      : await runProspectsCollectionStep();

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
