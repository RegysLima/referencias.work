import { NextResponse } from "next/server";
import { checkRemoteMedia, mapWithConcurrency } from "@/lib/mediaHealth";

type CheckItem = {
  id: string;
  url: string;
};

const MAX_ITEMS = 50;

export async function POST(req: Request) {
  const body = (await req.json()) as { items?: CheckItem[] };
  const items = Array.isArray(body?.items) ? body.items : [];

  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { ok: false, error: `Máximo de ${MAX_ITEMS} URLs por lote.` },
      { status: 400 }
    );
  }

  const results = await mapWithConcurrency(items, 6, async (item) => {
    const result = await checkRemoteMedia(item.url);
    return {
      id: item.id,
      ok: result.ok,
      status: result.status,
      reason: result.reason,
    };
  });

  return NextResponse.json({ ok: true, results });
}
