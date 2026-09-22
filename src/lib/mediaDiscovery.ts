import { load } from "cheerio";
import { checkRemoteMedia, isRecognizedVideoUrl, mapWithConcurrency } from "./mediaHealth";

export type MediaCandidateSource = "project" | "listing" | "generic";
export type MediaCandidateCollector =
  | "metadata"
  | "html"
  | "css"
  | "structured-data"
  | "serialized-data"
  | "browser";
export type MediaCandidateType = "image" | "video";

export type MediaCandidate = {
  url: string;
  sourcePageUrl: string;
  sourceKind: MediaCandidateSource;
  collector?: MediaCandidateCollector;
  mediaType?: MediaCandidateType;
  score?: number;
};

export type MediaDiscoveryResult = {
  candidates: MediaCandidate[];
  strategy: "static" | "browserbase" | "kernel";
  browserAttempted: boolean;
  browserError?: "not-configured" | "session-failed";
};

export type MediaDiscoveryOptions = {
  browserFallback?: boolean;
  browserDiscover?: (
    referenceUrl: string
  ) => Promise<{
    attempted: boolean;
    candidates: MediaCandidate[];
    error?: "not-configured" | "session-failed";
    provider?: "browserbase" | "kernel";
  }>;
};

const LISTING_PATHS = [
  "/work",
  "/works",
  "/projects",
  "/portfolio",
  "/cases",
  "/case-studies",
  "/selected-work",
  "/archive",
  "/projetos",
  "/trabalhos",
] as const;

const PROJECT_PATH_PATTERN =
  /(^|\/)(work|works|project|projects|case|cases|case-studies|portfolio|showcase|selected-work|projetos|trabalhos)(\/|$)/i;
const NON_PROJECT_PATH_PATTERN =
  /(^|\/)(about|contact|studio|services?|privacy|terms|news|journal|blog|careers?|jobs?|team|people|press|shop|cart|login|admin)(\/|$)/i;

function classifyPage(url: string, root: string): MediaCandidateSource {
  try {
    const page = new URL(url);
    const rootUrl = new URL(root);
    if (page.origin === rootUrl.origin && page.pathname === rootUrl.pathname) return "generic";

    const segments = page.pathname.split("/").filter(Boolean);
    const projectIndex = segments.findIndex((segment) =>
      /^(work|works|project|projects|case|cases|case-studies|portfolio|showcase|selected-work|projetos|trabalhos)$/i.test(
        segment
      )
    );
    return projectIndex >= 0 && segments.length > projectIndex + 1 ? "project" : "listing";
  } catch {
    return "generic";
  }
}

function absoluteUrl(base: string, value: string) {
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

function decodeEmbeddedUrl(value: string) {
  return value
    .replace(/\\u002f/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&")
    .trim();
}

function normalizeMediaUrl(pageUrl: string, value: string) {
  const decoded = decodeEmbeddedUrl(value || "").replace(/^['"]|['"]$/g, "");
  if (!decoded || decoded.startsWith("data:") || decoded.startsWith("blob:")) return "";
  const absolute = absoluteUrl(pageUrl, decoded);
  if (!absolute) return "";
  try {
    const parsed = new URL(absolute);
    if (parsed.pathname.includes("/_next/image")) {
      const inner = parsed.searchParams.get("url");
      if (inner) return absoluteUrl(pageUrl, decodeURIComponent(inner));
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function looksLikeMedia(url: string) {
  const value = url.toLowerCase();
  return (
    isRecognizedVideoUrl(value) ||
    /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(value) ||
    value.includes("wp-content/uploads") ||
    value.includes("/uploads/") ||
    value.includes("/images/") ||
    value.includes("imgix") ||
    value.includes("cloudinary") ||
    value.includes("prismic") ||
    value.includes("framerusercontent") ||
    value.includes("cdn.sanity.io/images/") ||
    value.includes("images.ctfassets.net")
  );
}

function isLikelyGarbage(url: string) {
  const value = url.toLowerCase();
  return [
    "logo",
    "favicon",
    "sprite",
    "icon",
    "burger",
    "menu",
    "arrow",
    "chevron",
    "close",
    "avatar",
    "portrait",
    "analytics",
    "doubleclick",
    "pixel",
    "tracking",
    "pagead",
    "clarity.ms",
    "cookiebot",
    "consent",
    "placeholder",
  ].some((token) => value.includes(token));
}

function inferMediaType(url: string): MediaCandidateType {
  return isRecognizedVideoUrl(url) ? "video" : "image";
}

function candidateScore(candidate: MediaCandidate) {
  const value = `${candidate.url} ${candidate.sourcePageUrl}`.toLowerCase();
  let score = candidate.sourceKind === "project" ? 100 : candidate.sourceKind === "listing" ? 40 : 0;
  if (candidate.collector === "structured-data") score += 10;
  if (candidate.collector === "metadata") score += 8;
  if (candidate.collector === "browser") score += 6;
  if (value.includes("wp-content/uploads")) score += 12;
  if (value.includes("/uploads/")) score += 8;
  if (value.includes("/work/") || value.includes("/project/") || value.includes("/case/")) score += 8;
  if (value.includes("portfolio")) score += 5;
  if (inferMediaType(candidate.url) === "video") score += 3;
  if (/\.(webp|avif)(\?|#|$)/i.test(candidate.url)) score += 2;
  return score;
}

export function rankMediaCandidates(
  candidates: MediaCandidate[],
  excludedUrls: Set<string> = new Set()
) {
  const bestByUrl = new Map<string, MediaCandidate>();
  for (const candidate of candidates) {
    if (candidate.sourceKind === "generic") continue;
    if (
      !candidate.url ||
      (!candidate.mediaType && !looksLikeMedia(candidate.url)) ||
      isLikelyGarbage(candidate.url)
    ) {
      continue;
    }
    if (excludedUrls.has(candidate.url)) continue;

    const enriched = {
      ...candidate,
      mediaType: candidate.mediaType || inferMediaType(candidate.url),
      score: candidateScore(candidate),
    };
    const current = bestByUrl.get(candidate.url);
    if (!current || (current.score || 0) < enriched.score) bestByUrl.set(candidate.url, enriched);
  }
  return Array.from(bestByUrl.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
}

function srcsetUrls(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function cssUrls(value: string) {
  const urls: string[] = [];
  const pattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match[2]) urls.push(match[2]);
  }
  return urls;
}

function collectStructuredMedia(value: unknown, add: (value: string) => void, mediaContext = false) {
  if (typeof value === "string") {
    if (mediaContext || looksLikeMedia(decodeEmbeddedUrl(value))) add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStructuredMedia(item, add, mediaContext);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextContext =
      mediaContext ||
      /^(image|images|video|videos|contentUrl|thumbnail|thumbnailUrl|embedUrl|poster|src|url)$/i.test(key);
    collectStructuredMedia(nested, add, nextContext);
  }
}

function parseJsonScript(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(decodeEmbeddedUrl(value));
    } catch {
      return null;
    }
  }
}

export function extractMediaCandidates(
  pageUrl: string,
  html: string,
  sourceKind: MediaCandidateSource
) {
  const $ = load(html);
  const candidates: MediaCandidate[] = [];
  const seen = new Set<string>();
  const add = (value: string | undefined, collector: MediaCandidateCollector) => {
    const normalized = normalizeMediaUrl(pageUrl, value || "");
    if (!normalized || !looksLikeMedia(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push({
      url: normalized,
      sourcePageUrl: pageUrl,
      sourceKind,
      collector,
      mediaType: inferMediaType(normalized),
    });
  };

  for (const selector of [
    "meta[property='og:image']",
    "meta[property='og:image:url']",
    "meta[property='og:image:secure_url']",
    "meta[name='twitter:image']",
  ]) {
    $(selector).each((_, element) => add($(element).attr("content"), "metadata"));
  }
  for (const selector of [
    "meta[property='og:video']",
    "meta[property='og:video:url']",
    "meta[property='og:video:secure_url']",
    "meta[name='twitter:player:stream']",
  ]) {
    $(selector).each((_, element) => add($(element).attr("content"), "metadata"));
  }

  $("source").each((_, element) => {
    add($(element).attr("src"), "html");
    for (const value of srcsetUrls($(element).attr("srcset") || "")) add(value, "html");
  });
  $("img, video").each((_, element) => {
    for (const attribute of [
      "src",
      "poster",
      "data-src",
      "data-lazy-src",
      "data-original",
      "data-video-src",
    ]) {
      add($(element).attr(attribute), "html");
    }
    for (const attribute of ["srcset", "data-srcset", "data-lazy-srcset"]) {
      for (const value of srcsetUrls($(element).attr(attribute) || "")) add(value, "html");
    }
  });
  $("[data-bg], [data-background], [data-background-image]").each((_, element) => {
    for (const attribute of ["data-bg", "data-background", "data-background-image"]) {
      const value = $(element).attr(attribute) || "";
      const extracted = cssUrls(value);
      if (extracted.length) extracted.forEach((url) => add(url, "css"));
      else add(value, "css");
    }
  });
  $("[style]").each((_, element) => {
    for (const value of cssUrls($(element).attr("style") || "")) add(value, "css");
  });
  $("style").each((_, element) => {
    for (const value of cssUrls($(element).html() || "")) add(value, "css");
  });

  $("script[type='application/ld+json']").each((_, element) => {
    const parsed = parseJsonScript($(element).html() || "");
    if (parsed) collectStructuredMedia(parsed, (value) => add(value, "structured-data"));
  });
  $("script[type='application/json'], script#__NEXT_DATA__").each((_, element) => {
    const parsed = parseJsonScript($(element).html() || "");
    if (parsed) collectStructuredMedia(parsed, (value) => add(value, "serialized-data"));
  });

  return candidates;
}

function isLikelyProjectPath(pathname: string) {
  if (NON_PROJECT_PATH_PATTERN.test(pathname)) return false;
  if (PROJECT_PATH_PATTERN.test(pathname)) return true;
  return pathname.split("/").filter(Boolean).length >= 2;
}

export function extractProjectLinks(pageUrl: string, html: string, origin: string) {
  const $ = load(html);
  const links = new Set<string>();
  $("a[href]").each((_, element) => {
    const absolute = absoluteUrl(pageUrl, $(element).attr("href") || "");
    if (!absolute) return;
    try {
      const parsed = new URL(absolute);
      if (parsed.origin !== origin) return;
      if (/\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|mov|pdf|zip)$/i.test(parsed.pathname)) return;

      const anchor = $(element);
      const knownProjectPath = PROJECT_PATH_PATTERN.test(parsed.pathname);
      const visualProjectCard =
        anchor.find("img, picture, video").length > 0 &&
        anchor.closest("nav, header, footer").length === 0 &&
        isLikelyProjectPath(parsed.pathname);
      if (!knownProjectPath && !visualProjectCard) return;

      parsed.hash = "";
      parsed.search = "";
      links.add(parsed.toString());
    } catch {
      // Ignore malformed links.
    }
  });
  return Array.from(links);
}

export function parseSitemapUrls(xml: string) {
  const $ = load(xml, { xmlMode: true });
  const urls: string[] = [];
  $("loc").each((_, element) => {
    const value = $(element).text().trim();
    if (value) urls.push(value);
  });
  return Array.from(new Set(urls));
}

async function fetchText(url: string, expected: "html" | "xml", timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome Safari",
        accept:
          expected === "html"
            ? "text/html,application/xhtml+xml"
            : "application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (expected === "html" && !contentType.includes("text/html")) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(url: string, timeoutMs = 6500) {
  return fetchText(url, "html", timeoutMs);
}

async function discoverSitemapProjectLinks(base: URL) {
  const sitemapUrl = new URL("/sitemap.xml", base.origin).toString();
  const sitemap = await fetchText(sitemapUrl, "xml");
  if (!sitemap) return [];

  const firstLevel = parseSitemapUrls(sitemap);
  const sitemapIndexes = firstLevel.filter((url) => /\.xml(\?|$)/i.test(url)).slice(0, 6);
  const nested = await mapWithConcurrency(sitemapIndexes, 3, async (url) => {
    const xml = await fetchText(url, "xml");
    return xml ? parseSitemapUrls(xml) : [];
  });
  const urls = sitemapIndexes.length ? nested.flat() : firstLevel;

  return urls.filter((value) => {
    try {
      const url = new URL(value);
      return url.origin === base.origin && isLikelyProjectPath(url.pathname);
    } catch {
      return false;
    }
  });
}

async function validateCandidates(candidates: MediaCandidate[], limit: number) {
  const reachable: MediaCandidate[] = [];
  for (let index = 0; index < candidates.length && reachable.length < limit; index += 8) {
    const checks = await mapWithConcurrency(candidates.slice(index, index + 8), 8, async (candidate) => ({
      candidate,
      health: await checkRemoteMedia(candidate.url, { timeoutMs: 6000 }),
    }));
    reachable.push(...checks.filter((result) => result.health.ok).map((result) => result.candidate));
  }
  return reachable.slice(0, limit);
}

export async function discoverMediaCandidatesDetailed(
  referenceUrl: string,
  excludedUrls: Set<string> = new Set(),
  limit = 60,
  options: MediaDiscoveryOptions = {}
): Promise<MediaDiscoveryResult> {
  let base: URL;
  try {
    base = new URL(referenceUrl);
  } catch {
    return { candidates: [], strategy: "static", browserAttempted: false };
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    return { candidates: [], strategy: "static", browserAttempted: false };
  }

  const root = `${base.origin}/`;
  const listingUrls = Array.from(
    new Set([referenceUrl, root, ...LISTING_PATHS.map((path) => new URL(path, root).toString())])
  );
  const [listingPages, sitemapLinks] = await Promise.all([
    mapWithConcurrency(listingUrls, 6, async (url) => ({ url, html: await fetchHtml(url) })),
    discoverSitemapProjectLinks(base),
  ]);

  const candidates: MediaCandidate[] = [];
  const projectLinks = new Set<string>(sitemapLinks);
  for (const page of listingPages) {
    if (!page.html) continue;
    const kind = classifyPage(page.url, root);
    candidates.push(...extractMediaCandidates(page.url, page.html, kind));
    for (const link of extractProjectLinks(page.url, page.html, base.origin)) projectLinks.add(link);
  }

  const projectPages = await mapWithConcurrency(
    Array.from(projectLinks).slice(0, 24),
    8,
    async (url) => ({ url, html: await fetchHtml(url) })
  );
  for (const page of projectPages) {
    if (page.html) candidates.push(...extractMediaCandidates(page.url, page.html, "project"));
  }

  const ranked = rankMediaCandidates(candidates, excludedUrls).slice(0, 80);
  const reachable = await validateCandidates(ranked, limit);
  if (reachable.length || options.browserFallback === false) {
    return { candidates: reachable, strategy: "static", browserAttempted: false };
  }

  const browserDiscover =
    options.browserDiscover ||
    (await import("./browserMediaDiscovery")).discoverMediaWithBrowser;
  const browserResult = await browserDiscover(referenceUrl);
  const browserRanked = rankMediaCandidates(browserResult.candidates, excludedUrls).slice(0, 80);
  const browserCandidates = await validateCandidates(browserRanked, limit);
  return {
    candidates: browserCandidates,
    strategy: browserCandidates.length ? browserResult.provider || "browserbase" : "static",
    browserAttempted: browserResult.attempted,
    browserError: browserResult.error,
  };
}

export async function discoverMediaCandidates(
  referenceUrl: string,
  excludedUrls: Set<string> = new Set(),
  limit = 60
) {
  const result = await discoverMediaCandidatesDetailed(referenceUrl, excludedUrls, limit);
  return result.candidates;
}

export async function discoverReplacementMedia(
  referenceUrl: string,
  excludedUrls: Set<string>,
  options: MediaDiscoveryOptions = {}
) {
  const result = await discoverMediaCandidatesDetailed(referenceUrl, excludedUrls, 1, options);
  return result.candidates[0] || null;
}
