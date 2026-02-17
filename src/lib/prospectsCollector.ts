import crypto from "node:crypto";
import { load } from "cheerio";
import type { ProspectCandidate, ProspectItem, ProspectsDB } from "@/lib/types";
import { readReferencesDb } from "@/lib/referencesDb";
import { readProspectsDb, writeProspectsDb } from "@/lib/prospectsDb";

const SOURCE_SITES = [
  { id: "visualjournal", url: "https://visualjournal.it/" },
  { id: "visuelle", url: "https://visuelle.co.uk/" },
] as const;

const MAX_PAGES_PER_SITE = 60;
const MAX_INTERNAL_LINKS_PER_PAGE = 120;
const MAX_EXTERNAL_CANDIDATES_PER_PAGE = 60;

const BLOCKED_HOSTS = [
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
  "vimeo.com",
  "tiktok.com",
  "pinterest.com",
  "behance.net",
  "dribbble.com",
  "discord.com",
  "telegram.me",
  "wa.me",
  "medium.com",
  "substack.com",
  "mailto",
] as const;

const GENERIC_ANCHORS = [
  "read more",
  "continue",
  "next",
  "open",
  "visit",
  "link",
  "website",
  "site",
  "project",
  "case",
] as const;

const AUTHOR_HINTS = [
  "author",
  "authors",
  "studio",
  "designer",
  "design",
  "by",
  "credit",
  "credits",
  "team",
  "agency",
] as const;

type CrawlContext = {
  pageUrl: string;
  siteId: string;
};

type CollectResult = {
  ok: boolean;
  crawledPages: number;
  discoveredCandidates: number;
  skippedAlreadyKnownDomains: number;
  newCandidates: number;
  updatedCandidates: number;
  totalActiveCandidates: number;
  error?: string;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomainFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host.includes("@")) return null;
    return host;
  } catch {
    return null;
  }
}

function normalizeAbsoluteUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/i.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isBlockedDomain(domain: string) {
  const clean = domain.toLowerCase();
  return BLOCKED_HOSTS.some((blocked) => clean === blocked || clean.endsWith(`.${blocked}`));
}

function isGenericAnchor(text: string) {
  const clean = normalizeText(text);
  if (!clean) return true;
  return GENERIC_ANCHORS.some((generic) => clean === generic || clean.startsWith(`${generic} `));
}

function scoreCandidate(anchorText: string, contextText: string) {
  const anchor = normalizeText(anchorText);
  const context = normalizeText(contextText);

  let score = 0;

  if (anchor && !isGenericAnchor(anchor)) {
    score += 2;
  }

  if (anchor.split(" ").length <= 4 && anchor.length >= 3 && anchor.length <= 60) {
    score += 2;
  }

  if (AUTHOR_HINTS.some((hint) => context.includes(hint) || anchor.includes(hint))) {
    score += 2;
  }

  return score;
}

function toCandidateId(domain: string) {
  return crypto.createHash("sha1").update(domain).digest("hex").slice(0, 16);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "referencias.work-bot/1.0 (+https://referencias.work)",
      },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    return await response.text();
  } catch {
    return null;
  }
}

function extractFromPage(html: string, siteUrl: string, context: CrawlContext) {
  const $ = load(html);
  const siteHost = normalizeDomainFromUrl(siteUrl);
  const internalLinks: string[] = [];
  const candidates: ProspectCandidate[] = [];

  $("a[href]").each((_, node) => {
    if (internalLinks.length >= MAX_INTERNAL_LINKS_PER_PAGE && candidates.length >= MAX_EXTERNAL_CANDIDATES_PER_PAGE) {
      return;
    }

    const href = ($(node).attr("href") || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

    const absolute = normalizeAbsoluteUrl(href, context.pageUrl);
    if (!absolute) return;

    const domain = normalizeDomainFromUrl(absolute);
    if (!domain) return;

    const anchorText = ($(node).text() || "").trim();
    const parentText = ($(node).parent().text() || "").trim();
    const ariaLabel = ($(node).attr("aria-label") || "").trim();
    const contextText = [anchorText, ariaLabel, parentText].filter(Boolean).join(" ");

    const isInternal = siteHost
      ? domain === siteHost || domain.endsWith(`.${siteHost}`)
      : false;

    if (isInternal) {
      if (internalLinks.length >= MAX_INTERNAL_LINKS_PER_PAGE) return;
      internalLinks.push(absolute);
      return;
    }

    if (isBlockedDomain(domain)) return;

    const score = scoreCandidate(anchorText, contextText);
    if (score < 3) return;
    if (candidates.length >= MAX_EXTERNAL_CANDIDATES_PER_PAGE) return;

    const label = anchorText && !isGenericAnchor(anchorText) ? anchorText : null;

    candidates.push({
      domain,
      homepageUrl: absolute,
      displayName: label,
      sourceSite: context.siteId,
      sourcePageUrl: context.pageUrl,
      score,
    });
  });

  return {
    internalLinks,
    candidates,
  };
}

function mergeSources(
  current: ProspectItem["sources"],
  incoming: ProspectItem["sources"]
): ProspectItem["sources"] {
  const seen = new Set<string>();
  const out: ProspectItem["sources"] = [];

  for (const row of [...current, ...incoming]) {
    const key = `${row.siteId}|${row.sourcePageUrl}|${row.homepageUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out.slice(0, 25);
}

async function crawlSourceSite(siteId: string, siteUrl: string) {
  const queue: string[] = [siteUrl];
  const visited = new Set<string>();
  const candidateMap = new Map<string, ProspectCandidate>();

  while (queue.length && visited.size < MAX_PAGES_PER_SITE) {
    const pageUrl = queue.shift();
    if (!pageUrl) continue;
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    const html = await fetchHtml(pageUrl);
    if (!html) continue;

    const extracted = extractFromPage(html, siteUrl, { pageUrl, siteId });

    for (const link of extracted.internalLinks) {
      if (visited.has(link)) continue;
      if (queue.includes(link)) continue;
      queue.push(link);
    }

    for (const candidate of extracted.candidates) {
      const existing = candidateMap.get(candidate.domain);
      if (!existing || candidate.score > existing.score) {
        candidateMap.set(candidate.domain, candidate);
      }
    }
  }

  return {
    crawledPages: visited.size,
    candidates: Array.from(candidateMap.values()),
  };
}

function existingReferenceDomains(urls: string[]) {
  const set = new Set<string>();
  for (const url of urls) {
    const domain = normalizeDomainFromUrl(url);
    if (!domain) continue;
    set.add(domain);
  }
  return set;
}

export async function collectProspectsMvp(): Promise<CollectResult> {
  const startedAt = new Date().toISOString();

  try {
    const [referencesDb, prospectsDb] = await Promise.all([
      readReferencesDb(),
      readProspectsDb(),
    ]);

    const refDomainSet = existingReferenceDomains(referencesDb.items.map((item) => item.url));

    const crawlResults = await Promise.all(
      SOURCE_SITES.map((source) => crawlSourceSite(source.id, source.url))
    );

    const crawledPages = crawlResults.reduce((acc, row) => acc + row.crawledPages, 0);
    const discoveredRaw = crawlResults.flatMap((row) => row.candidates);

    const deduped = new Map<string, ProspectCandidate>();
    for (const candidate of discoveredRaw) {
      const existing = deduped.get(candidate.domain);
      if (!existing || candidate.score > existing.score) {
        deduped.set(candidate.domain, candidate);
      }
    }

    const now = new Date().toISOString();
    const incoming = Array.from(deduped.values());

    let skippedAlreadyKnownDomains = 0;
    let newCandidates = 0;
    let updatedCandidates = 0;

    const itemsByDomain = new Map(
      prospectsDb.items.map((item) => [item.domain.toLowerCase(), item] as const)
    );

    for (const candidate of incoming) {
      if (refDomainSet.has(candidate.domain)) {
        skippedAlreadyKnownDomains += 1;
        continue;
      }

      const key = candidate.domain.toLowerCase();
      const existing = itemsByDomain.get(key);

      const sourceRow = {
        siteId: candidate.sourceSite,
        sourcePageUrl: candidate.sourcePageUrl,
        homepageUrl: candidate.homepageUrl,
        label: candidate.displayName || null,
      };

      if (!existing) {
        const created: ProspectItem = {
          id: toCandidateId(candidate.domain),
          domain: candidate.domain,
          displayName: candidate.displayName || null,
          homepageUrl: candidate.homepageUrl,
          status: "new",
          notes: null,
          occurrences: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          sources: [sourceRow],
        };
        itemsByDomain.set(key, created);
        newCandidates += 1;
        continue;
      }

      const mergedSources = mergeSources(existing.sources || [], [sourceRow]);
      const changedSources = mergedSources.length !== (existing.sources || []).length;
      const changedDisplayName = !existing.displayName && candidate.displayName;
      const changedHomepage = !existing.homepageUrl && candidate.homepageUrl;

      itemsByDomain.set(key, {
        ...existing,
        displayName: changedDisplayName ? candidate.displayName || null : existing.displayName,
        homepageUrl: changedHomepage ? candidate.homepageUrl : existing.homepageUrl,
        occurrences: Math.max(1, existing.occurrences || 1) + 1,
        lastSeenAt: now,
        sources: mergedSources,
      });

      if (changedSources || changedDisplayName || changedHomepage) {
        updatedCandidates += 1;
      }
    }

    const items = Array.from(itemsByDomain.values()).sort((a, b) => {
      const statusWeight = (value: ProspectItem["status"]) => {
        if (value === "new") return 0;
        if (value === "approved") return 1;
        return 2;
      };

      const weightDiff = statusWeight(a.status) - statusWeight(b.status);
      if (weightDiff !== 0) return weightDiff;
      return (b.lastSeenAt || "").localeCompare(a.lastSeenAt || "");
    });

    const nextDb: ProspectsDB = {
      ...prospectsDb,
      items,
      count: items.length,
      updatedAt: now,
      lastRun: {
        ranAt: now,
        startedAt,
        ok: true,
        crawledPages,
        discoveredCandidates: incoming.length,
        skippedAlreadyKnownDomains,
        newCandidates,
        updatedCandidates,
        error: null,
      },
    };

    await writeProspectsDb(nextDb);

    return {
      ok: true,
      crawledPages,
      discoveredCandidates: incoming.length,
      skippedAlreadyKnownDomains,
      newCandidates,
      updatedCandidates,
      totalActiveCandidates: items.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    const db = await readProspectsDb();
    const now = new Date().toISOString();
    await writeProspectsDb({
      ...db,
      lastRun: {
        ranAt: now,
        startedAt,
        ok: false,
        crawledPages: 0,
        discoveredCandidates: 0,
        skippedAlreadyKnownDomains: 0,
        newCandidates: 0,
        updatedCandidates: 0,
        error: message,
      },
    });

    return {
      ok: false,
      crawledPages: 0,
      discoveredCandidates: 0,
      skippedAlreadyKnownDomains: 0,
      newCandidates: 0,
      updatedCandidates: 0,
      totalActiveCandidates: db.items.length,
      error: message,
    };
  }
}
