export type MediaHealthResult = {
  ok: boolean;
  status: number;
  reason: string;
  contentType: string;
};

type MediaResponseMetadata = {
  status: number;
  contentType: string;
  contentLength: number | null;
  url: string;
};

const DEFAULT_TIMEOUT_MS = 7000;

export function hasStoredMediaProblem(input: {
  thumbnailUrl?: string | null;
  mediaReview?: { outcome?: "replaced" | "missing" } | null;
}) {
  return !input.thumbnailUrl?.trim();
}

export function isRecognizedVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v|ogv|m3u8)(\?|#|$)/i.test(url);
}

export function isRecognizedImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i.test(url);
}

export function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidContentType(contentType: string, url: string) {
  const normalized = contentType.toLowerCase();
  if (!normalized) return isRecognizedImageUrl(url) || isRecognizedVideoUrl(url);
  if (normalized.startsWith("image/") || normalized.startsWith("video/")) return true;
  if (normalized.includes("application/vnd.apple.mpegurl")) return true;
  if (normalized.includes("application/x-mpegurl")) return true;
  if (
    normalized.includes("application/octet-stream") &&
    (isRecognizedImageUrl(url) || isRecognizedVideoUrl(url))
  ) {
    return true;
  }
  return false;
}

export function validateMediaResponse(input: MediaResponseMetadata) {
  if (input.status < 200 || input.status >= 400) {
    return { ok: false, reason: "http_error" };
  }
  if (!isValidContentType(input.contentType, input.url)) {
    return { ok: false, reason: "invalid_content_type" };
  }
  if (input.contentLength === 0) {
    return { ok: false, reason: "empty_file" };
  }
  return { ok: true, reason: "ok" };
}

function contentLength(headers: Headers) {
  const raw = headers.get("content-length");
  if (raw === null || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome Safari",
        accept: "image/avif,image/webp,image/apng,image/*,video/*,*/*;q=0.8",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function resultFromResponse(response: Response, url: string) {
  const contentType = response.headers.get("content-type") || "";
  const validation = validateMediaResponse({
    status: response.status,
    contentType,
    contentLength: contentLength(response.headers),
    url,
  });
  return {
    ...validation,
    status: response.status,
    contentType,
  };
}

export async function checkRemoteMedia(
  url: string,
  options?: { timeoutMs?: number }
): Promise<MediaHealthResult> {
  if (!isHttpUrl(url)) {
    return { ok: false, status: 0, reason: "invalid_url", contentType: "" };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const head = await fetchWithTimeout(url, { method: "HEAD" }, timeoutMs);
    const headResult = resultFromResponse(head, url);
    await head.body?.cancel();
    if (headResult.ok) return headResult;
  } catch {
    // Some media hosts reject HEAD; the ranged GET below is authoritative.
  }

  try {
    const get = await fetchWithTimeout(
      url,
      { method: "GET", headers: { range: "bytes=0-1" } },
      timeoutMs
    );
    const getResult = resultFromResponse(get, url);
    await get.body?.cancel();
    return getResult;
  } catch {
    return { ok: false, status: 0, reason: "request_failed", contentType: "" };
  }
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(values[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, () => runWorker())
  );
  return results;
}
