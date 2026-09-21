import { load } from "cheerio";
import { checkRemoteMedia, isRecognizedVideoUrl, mapWithConcurrency } from "./mediaHealth";

export type MediaCandidateSource = "project" | "listing" | "generic";

export type MediaCandidate = {
  url: string;
  sourcePageUrl: string;
  sourceKind: MediaCandidateSource;
};

const LISTING_PATHS = [
  "/work",
  "/works",
  "/projects",
  "/portfolio",
  "/cases",
  "/case-studies",
  "/projetos",
  "/trabalhos",
] as const;

function classifyPage(url: string, root: string): MediaCandidateSource {
  try {
    const page = new URL(url);
    const rootUrl = new URL(root);
    if (page.origin === rootUrl.origin && page.pathname === rootUrl.pathname) return "generic";

    const segments = page.pathname.split("/").filter(Boolean);
    const projectIndex = segments.findIndex((segment) =>
      /^(work|works|project|projects|case|cases|case-studies|portfolio|showcase)$/i.test(segment)
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

function normalizeMediaUrl(pageUrl: string, value: string) {
  const decoded = (value || "").trim().replace(/&amp;/gi, "&");
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
    "placeholder",
  ].some((token) => value.includes(token));
}

function candidateScore(candidate: MediaCandidate) {
  const value = `${candidate.url} ${candidate.sourcePageUrl}`.toLowerCase();
  let score = candidate.sourceKind === "project" ? 100 : candidate.sourceKind === "listing" ? 40 : 0;
  if (value.includes("wp-content/uploads")) score += 12;
  if (value.includes("/uploads/")) score += 8;
  if (value.includes("/work/") || value.includes("/project/") || value.includes("/case/")) score += 8;
  if (value.includes("portfolio")) score += 5;
  if (isRecognizedVideoUrl(candidate.url)) score += 3;
  if (/\.(webp|avif)(\?|#|$)/i.test(candidate.url)) score += 2;
  return score;
}

export function rankMediaCandidates(
  candidates: MediaCandidate[],
  excludedUrls: Set<string> = new Set()
) {
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      if (candidate.sourceKind === "generic") return false;
      if (!candidate.url || !looksLikeMedia(candidate.url) || isLikelyGarbage(candidate.url)) return false;
      if (excludedUrls.has(candidate.url) || seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    })
    .sort((a, b) => candidateScore(b) - candidateScore(a));
}

export function extractMediaCandidates(
  pageUrl: string,
  html: string,
  sourceKind: MediaCandidateSource
) {
  const $ = load(html);
  const urls: string[] = [];
  const add = (value: string | undefined) => {
    const normalized = normalizeMediaUrl(pageUrl, value || "");
    if (normalized) urls.push(normalized);
  };

  add($("meta[property='og:image']").attr("content"));
  add($("meta[name='twitter:image']").attr("content"));
  $("img").each((_, element) => {
    add($(element).attr("src"));
    add($(element).attr("data-src"));
    for (const attribute of ["srcset", "data-srcset"]) {
      const srcset = $(element).attr(attribute) || "";
      for (const entry of srcset.split(",")) add(entry.trim().split(/\s+/)[0]);
    }
  });
  $("video").each((_, element) => {
    add($(element).attr("src"));
    add($(element).attr("poster"));
  });
  $("video source").each((_, element) => add($(element).attr("src")));
  $("[data-bg], [data-background]").each((_, element) => {
    add($(element).attr("data-bg"));
    add($(element).attr("data-background"));
  });

  return urls.map((url) => ({ url, sourcePageUrl: pageUrl, sourceKind }));
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
      if (!/(^|\/)(work|works|project|projects|case|cases|portfolio|showcase)(\/|$)/i.test(parsed.pathname)) {
        return;
      }
      if (/\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|mov|pdf|zip)$/i.test(parsed.pathname)) return;
      parsed.hash = "";
      parsed.search = "";
      links.add(parsed.toString());
    } catch {
      // Ignore malformed links.
    }
  });
  return Array.from(links);
}

async function fetchHtml(url: string, timeoutMs = 6500) {
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
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverMediaCandidates(
  referenceUrl: string,
  excludedUrls: Set<string> = new Set(),
  limit = 60
) {
  let base: URL;
  try {
    base = new URL(referenceUrl);
  } catch {
    return [];
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") return [];

  const root = `${base.origin}/`;
  const listingUrls = Array.from(
    new Set([referenceUrl, root, ...LISTING_PATHS.map((path) => new URL(path, root).toString())])
  );
  const listingPages = await mapWithConcurrency(listingUrls, 6, async (url) => ({
    url,
    html: await fetchHtml(url),
  }));

  const candidates: MediaCandidate[] = [];
  const projectLinks = new Set<string>();
  for (const page of listingPages) {
    if (!page.html) continue;
    const kind = classifyPage(page.url, root);
    candidates.push(...extractMediaCandidates(page.url, page.html, kind));
    for (const link of extractProjectLinks(page.url, page.html, base.origin)) projectLinks.add(link);
  }

  const projectPages = await mapWithConcurrency(
    Array.from(projectLinks).slice(0, 16),
    8,
    async (url) => ({ url, html: await fetchHtml(url) })
  );
  for (const page of projectPages) {
    if (page.html) candidates.push(...extractMediaCandidates(page.url, page.html, "project"));
  }

  const ranked = rankMediaCandidates(candidates, excludedUrls).slice(0, 60);
  const reachable: MediaCandidate[] = [];
  for (let index = 0; index < ranked.length && reachable.length < limit; index += 8) {
    const checks = await mapWithConcurrency(ranked.slice(index, index + 8), 8, async (candidate) => ({
      candidate,
      health: await checkRemoteMedia(candidate.url, { timeoutMs: 6000 }),
    }));
    reachable.push(
      ...checks.filter((result) => result.health.ok).map((result) => result.candidate)
    );
  }
  return reachable.slice(0, limit);
}

export async function discoverReplacementMedia(referenceUrl: string, excludedUrls: Set<string>) {
  const candidates = await discoverMediaCandidates(referenceUrl, excludedUrls, 1);
  return candidates[0] || null;
}
