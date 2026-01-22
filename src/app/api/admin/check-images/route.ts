import { NextResponse } from "next/server";

type CheckItem = {
  id: string;
  url: string;
};

const MAX_ITEMS = 50;
const TIMEOUT_MS = 8000;
const CONCURRENCY = 6;

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkUrl(url: string) {
  if (!isHttpUrl(url)) {
    return { ok: false, status: 0 };
  }

  try {
    const head = await fetchWithTimeout(url, { method: "HEAD" });
    if (head.status >= 200 && head.status < 400) {
      return { ok: true, status: head.status };
    }

    if (head.status === 405 || head.status === 403) {
      const get = await fetchWithTimeout(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
      });
      return { ok: get.status >= 200 && get.status < 400, status: get.status };
    }

    return { ok: false, status: head.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function POST(req: Request) {
  const body = (await req.json()) as { items?: CheckItem[] };
  const items = Array.isArray(body?.items) ? body.items : [];

  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { ok: false, error: `Máximo de ${MAX_ITEMS} URLs por lote.` },
      { status: 400 }
    );
  }

  const results = await mapLimit(items, CONCURRENCY, async (item) => {
    const res = await checkUrl(item.url);
    return { id: item.id, ok: res.ok, status: res.status };
  });

  return NextResponse.json({ ok: true, results });
}
