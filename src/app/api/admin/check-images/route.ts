import { NextResponse } from "next/server";

type CheckItem = {
  id: string;
  url: string;
};

const MAX_ITEMS = 50;
const TIMEOUT_MS = 8000;
const CONCURRENCY = 6;

function looksLikeVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v|ogv|m3u8)(\?|#|$)/i.test(url);
}

function looksLikeImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i.test(url);
}

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

function isValidMediaContentType(contentType: string, url: string) {
  const ct = (contentType || "").toLowerCase();
  if (!ct) return looksLikeImageUrl(url) || looksLikeVideoUrl(url);
  if (ct.startsWith("image/")) return true;
  if (ct.startsWith("video/")) return true;
  if (ct.includes("application/vnd.apple.mpegurl")) return true;
  if (ct.includes("application/x-mpegurl")) return true;
  return false;
}

async function checkUrl(url: string) {
  if (!isHttpUrl(url)) {
    return { ok: false, status: 0, reason: "invalid_url" };
  }

  try {
    const head = await fetchWithTimeout(url, { method: "HEAD" });
    const headType = head.headers.get("content-type") || "";
    const headLength = Number(head.headers.get("content-length") || "0");

    if (head.status >= 200 && head.status < 400) {
      if (!isValidMediaContentType(headType, url)) {
        return { ok: false, status: head.status, reason: "invalid_content_type" };
      }
      if (Number.isFinite(headLength) && headLength === 0) {
        return { ok: false, status: head.status, reason: "empty_file" };
      }
      return { ok: true, status: head.status, reason: "ok" };
    }

    if (head.status === 405 || head.status === 403) {
      const get = await fetchWithTimeout(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
      });
      const getType = get.headers.get("content-type") || "";
      const getLength = Number(get.headers.get("content-length") || "0");
      if (!(get.status >= 200 && get.status < 400)) {
        return { ok: false, status: get.status, reason: "http_error" };
      }
      if (!isValidMediaContentType(getType, url)) {
        return { ok: false, status: get.status, reason: "invalid_content_type" };
      }
      if (Number.isFinite(getLength) && getLength === 0) {
        return { ok: false, status: get.status, reason: "empty_file" };
      }
      return { ok: true, status: get.status, reason: "ok" };
    }

    return { ok: false, status: head.status, reason: "http_error" };
  } catch {
    return { ok: false, status: 0, reason: "request_failed" };
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
    return { id: item.id, ok: res.ok, status: res.status, reason: res.reason };
  });

  return NextResponse.json({ ok: true, results });
}
