import crypto from "node:crypto";
import { load } from "cheerio";
import type { ProspectCandidate, ProspectItem, ProspectsDB } from "@/lib/types";
import { readReferencesDb } from "@/lib/referencesDb";
import { readProspectsDb, writeProspectsDb } from "@/lib/prospectsDb";

const SOURCE_SITES = [
  {
    id: "visualjournal",
    siteUrl: "https://visualjournal.it/",
    seeds: [
      "https://visualjournal.it/",
      "https://visualjournal.it/tag/branding/",
      "https://visualjournal.it/tag/graphic-design/",
    ],
  },
  {
    id: "visuelle",
    siteUrl: "https://visuelle.co.uk/",
    seeds: [
      "https://visuelle.co.uk/",
      "https://visuelle.co.uk/work/",
      "https://visuelle.co.uk/studios/",
    ],
  },
  {
    id: "mindsparklemag",
    siteUrl: "https://mindsparklemag.com/",
    seeds: [
      "https://mindsparklemag.com/inspiration",
      "https://mindsparklemag.com/category/inspiration/",
    ],
  },
  {
    id: "the-brandidentity",
    siteUrl: "https://the-brandidentity.com/",
    seeds: [
      "https://the-brandidentity.com/features",
      "https://the-brandidentity.com/",
    ],
  },
] as const;

const MAX_PAGES_PER_SITE = 140;
const MAX_INTERNAL_LINKS_PER_PAGE = 120;
const MAX_EXTERNAL_CANDIDATES_PER_PAGE = 60;
const STEP_PAGE_BUDGET = 10;
const STEP_TIME_BUDGET_MS = 6500;
const FETCH_TIMEOUT_MS = 2800;

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
  "buymeacoffee.com",
  "ko-fi.com",
  "patreon.com",
  "spotify.com",
  "apple.com",
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
  "podcast",
  "podcasts",
  "subscribe",
  "newsletter",
  "support",
  "buy me a coffee",
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

const BLOCKED_CANDIDATE_KEYWORDS = [
  "podcast",
  "podcasts",
  "spotify",
  "open.spotify",
  "apple podcast",
  "apple podcasts",
  "podcasts.apple",
  "itunes",
  "buy me a coffee",
  "buymeacoffee",
  "donate",
  "donation",
  "newsletter",
  "shop",
  "store",
  "episode",
  "listen",
] as const;

type CrawlContext = {
  pageUrl: string;
  siteId: string;
};

type CrawlSiteState = {
  siteId: string;
  siteUrl: string;
  queue: string[];
  queuedSet: Set<string>;
  visitedSet: Set<string>;
  candidates: Record<string, ProspectCandidate>;
};

type CrawlState = {
  active: boolean;
  startedAt: string;
  updatedAt: string;
  processedPages: number;
  totalPlannedPages: number;
  siteIndex: number;
  sites: CrawlSiteState[];
};

export type CollectionStepResult = {
  ok: boolean;
  done: boolean;
  active: boolean;
  progressPct: number;
  progressLabel: string;
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
    const removeParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    for (const key of removeParams) {
      url.searchParams.delete(key);
    }
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

function hasBlockedCandidateKeyword(text: string) {
  const clean = normalizeText(text);
  if (!clean) return false;
  return BLOCKED_CANDIDATE_KEYWORDS.some(
    (token) => clean.includes(token) || clean.replace(/\s+/g, "").includes(token.replace(/\s+/g, ""))
  );
}

function isNoisyCandidate(input: {
  domain?: string | null;
  homepageUrl?: string | null;
  displayName?: string | null;
  sourcePageUrl?: string | null;
  label?: string | null;
}) {
  const domain = (input.domain || "").toLowerCase().trim();
  if (domain && isBlockedDomain(domain)) return true;

  const bag = [
    input.domain || "",
    input.homepageUrl || "",
    input.displayName || "",
    input.sourcePageUrl || "",
    input.label || "",
  ]
    .join(" ")
    .trim();

  return hasBlockedCandidateKeyword(bag);
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "referencias.work-bot/1.0 (+https://referencias.work)",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
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

    const urlForCheck = `${absolute} ${domain}`;
    if (hasBlockedCandidateKeyword(urlForCheck)) return;
    if (hasBlockedCandidateKeyword(contextText) || hasBlockedCandidateKeyword(anchorText)) return;

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

function existingReferenceDomains(urls: string[]) {
  const set = new Set<string>();
  for (const url of urls) {
    const domain = normalizeDomainFromUrl(url);
    if (!domain) continue;
    set.add(domain);
  }
  return set;
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

function createInitialCrawlState(): CrawlState {
  const startedAt = new Date().toISOString();
  return {
    active: true,
    startedAt,
    updatedAt: startedAt,
    processedPages: 0,
    totalPlannedPages: SOURCE_SITES.length * MAX_PAGES_PER_SITE,
    siteIndex: 0,
    sites: SOURCE_SITES.map((source) => {
      const queue = Array.from(new Set([source.siteUrl, ...source.seeds]));
      return {
        siteId: source.id,
        siteUrl: source.siteUrl,
        queue,
        queuedSet: new Set(queue),
        visitedSet: new Set<string>(),
        candidates: {},
      };
    }),
  };
}

function serializeCrawlState(state: CrawlState): NonNullable<ProspectsDB["crawlState"]> {
  return {
    active: state.active,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    processedPages: state.processedPages,
    totalPlannedPages: state.totalPlannedPages,
    siteIndex: state.siteIndex,
    sites: state.sites.map((site) => ({
      siteId: site.siteId,
      siteUrl: site.siteUrl,
      queue: site.queue,
      queuedSet: Array.from(site.queuedSet),
      visitedSet: Array.from(site.visitedSet),
      candidates: site.candidates,
    })),
  };
}

function hydrateCrawlState(input: ProspectsDB["crawlState"]): CrawlState | null {
  if (!input || !input.active || !Array.isArray(input.sites)) return null;
  return {
    active: true,
    startedAt: input.startedAt,
    updatedAt: input.updatedAt,
    processedPages: input.processedPages || 0,
    totalPlannedPages: input.totalPlannedPages || SOURCE_SITES.length * MAX_PAGES_PER_SITE,
    siteIndex: input.siteIndex || 0,
    sites: input.sites.map((site) => ({
      siteId: site.siteId,
      siteUrl: site.siteUrl,
      queue: Array.isArray(site.queue) ? [...site.queue] : [],
      queuedSet: new Set(Array.isArray(site.queuedSet) ? site.queuedSet : []),
      visitedSet: new Set(Array.isArray(site.visitedSet) ? site.visitedSet : []),
      candidates: site.candidates || {},
    })),
  };
}

function findNextSiteIndex(state: CrawlState) {
  for (let i = state.siteIndex; i < state.sites.length; i += 1) {
    const site = state.sites[i];
    if (!site) continue;
    if (site.visitedSet.size >= MAX_PAGES_PER_SITE) continue;
    if (!site.queue.length) continue;
    return i;
  }

  for (let i = 0; i < state.siteIndex; i += 1) {
    const site = state.sites[i];
    if (!site) continue;
    if (site.visitedSet.size >= MAX_PAGES_PER_SITE) continue;
    if (!site.queue.length) continue;
    return i;
  }

  return -1;
}

async function executeCrawlStep(state: CrawlState) {
  const startedAt = Date.now();
  let processedThisStep = 0;

  while (processedThisStep < STEP_PAGE_BUDGET && Date.now() - startedAt < STEP_TIME_BUDGET_MS) {
    const nextSiteIndex = findNextSiteIndex(state);
    if (nextSiteIndex < 0) {
      state.active = false;
      break;
    }

    state.siteIndex = nextSiteIndex;
    const site = state.sites[nextSiteIndex];
    if (!site) {
      state.active = false;
      break;
    }

    const pageUrl = site.queue.shift();
    if (!pageUrl) continue;
    site.queuedSet.delete(pageUrl);

    if (site.visitedSet.has(pageUrl)) continue;
    site.visitedSet.add(pageUrl);
    processedThisStep += 1;
    state.processedPages += 1;

    const html = await fetchHtml(pageUrl);
    if (!html) continue;

    const extracted = extractFromPage(html, site.siteUrl, { pageUrl, siteId: site.siteId });

    for (const link of extracted.internalLinks) {
      if (site.visitedSet.has(link)) continue;
      if (site.queuedSet.has(link)) continue;
      site.queue.push(link);
      site.queuedSet.add(link);
    }

    for (const candidate of extracted.candidates) {
      const existing = site.candidates[candidate.domain];
      if (!existing || candidate.score > existing.score) {
        site.candidates[candidate.domain] = candidate;
      }
    }
  }

  state.updatedAt = new Date().toISOString();
}

function dedupCandidatesFromState(state: CrawlState) {
  const deduped = new Map<string, ProspectCandidate>();
  for (const site of state.sites) {
    for (const candidate of Object.values(site.candidates || {})) {
      const existing = deduped.get(candidate.domain);
      if (!existing || candidate.score > existing.score) {
        deduped.set(candidate.domain, candidate);
      }
    }
  }
  return Array.from(deduped.values());
}

async function finalizeCollection(db: ProspectsDB, state: CrawlState): Promise<CollectionStepResult> {
  const referencesDb = await readReferencesDb();
  const refDomainSet = existingReferenceDomains(referencesDb.items.map((item) => item.url));

  const incoming = dedupCandidatesFromState(state).filter((candidate) => {
    return !isNoisyCandidate({
      domain: candidate.domain,
      homepageUrl: candidate.homepageUrl,
      displayName: candidate.displayName,
      sourcePageUrl: candidate.sourcePageUrl,
      label: candidate.displayName,
    });
  });
  const now = new Date().toISOString();

  let skippedAlreadyKnownDomains = 0;
  let newCandidates = 0;
  let updatedCandidates = 0;

  const itemsByDomain = new Map(
    db.items
      .filter((item) => {
        return !isNoisyCandidate({
          domain: item.domain,
          homepageUrl: item.homepageUrl,
          displayName: item.displayName,
          sourcePageUrl: item.sources?.[0]?.sourcePageUrl || "",
          label: item.sources?.[0]?.label || "",
        });
      })
      .map((item) => [item.domain.toLowerCase(), item] as const)
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
      occurrences: mergedSources.length,
      lastSeenAt: now,
      sources: mergedSources,
    });

    if (changedSources || changedDisplayName || changedHomepage) {
      updatedCandidates += 1;
    }
  }

  const items = Array.from(itemsByDomain.values())
    .map((item) => ({
      ...item,
      occurrences: Math.max(1, (item.sources || []).length),
    }))
    .sort((a, b) => {
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
    ...db,
    items,
    count: items.length,
    updatedAt: now,
    crawlState: null,
    lastRun: {
      ranAt: now,
      startedAt: state.startedAt,
      ok: true,
      crawledPages: state.processedPages,
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
    done: true,
    active: false,
    progressPct: 100,
    progressLabel: "100%",
    crawledPages: state.processedPages,
    discoveredCandidates: incoming.length,
    skippedAlreadyKnownDomains,
    newCandidates,
    updatedCandidates,
    totalActiveCandidates: items.length,
  };
}

function progressPct(state: CrawlState) {
  if (!state.totalPlannedPages) return 0;
  const raw = Math.floor((state.processedPages / state.totalPlannedPages) * 100);
  return Math.max(0, Math.min(99, raw));
}

export async function getProspectsCollectionStatus(): Promise<CollectionStepResult> {
  const db = await readProspectsDb();
  const state = hydrateCrawlState(db.crawlState);

  if (!state || !state.active) {
    const crawled = db.lastRun?.crawledPages || 0;
    return {
      ok: true,
      done: true,
      active: false,
      progressPct: 100,
      progressLabel: "100%",
      crawledPages: crawled,
      discoveredCandidates: db.lastRun?.discoveredCandidates || 0,
      skippedAlreadyKnownDomains: db.lastRun?.skippedAlreadyKnownDomains || 0,
      newCandidates: db.lastRun?.newCandidates || 0,
      updatedCandidates: db.lastRun?.updatedCandidates || 0,
      totalActiveCandidates: db.items.length,
    };
  }

  const pct = progressPct(state);
  return {
    ok: true,
    done: false,
    active: true,
    progressPct: pct,
    progressLabel: `${pct}%`,
    crawledPages: state.processedPages,
    discoveredCandidates: dedupCandidatesFromState(state).length,
    skippedAlreadyKnownDomains: 0,
    newCandidates: 0,
    updatedCandidates: 0,
    totalActiveCandidates: db.items.length,
  };
}

export async function startProspectsCollection(): Promise<CollectionStepResult> {
  const db = await readProspectsDb();
  const current = hydrateCrawlState(db.crawlState);

  if (current?.active) {
    const pct = progressPct(current);
    return {
      ok: true,
      done: false,
      active: true,
      progressPct: pct,
      progressLabel: `${pct}%`,
      crawledPages: current.processedPages,
      discoveredCandidates: dedupCandidatesFromState(current).length,
      skippedAlreadyKnownDomains: 0,
      newCandidates: 0,
      updatedCandidates: 0,
      totalActiveCandidates: db.items.length,
    };
  }

  const state = createInitialCrawlState();
  await writeProspectsDb({
    ...db,
    crawlState: serializeCrawlState(state),
  });

  return {
    ok: true,
    done: false,
    active: true,
    progressPct: 0,
    progressLabel: "0%",
    crawledPages: 0,
    discoveredCandidates: 0,
    skippedAlreadyKnownDomains: 0,
    newCandidates: 0,
    updatedCandidates: 0,
    totalActiveCandidates: db.items.length,
  };
}

export async function runProspectsCollectionStep(): Promise<CollectionStepResult> {
  const db = await readProspectsDb();
  const state = hydrateCrawlState(db.crawlState);

  if (!state || !state.active) {
    return await startProspectsCollection();
  }

  try {
    await executeCrawlStep(state);

    if (!state.active) {
      return await finalizeCollection(db, state);
    }

    const serialized = serializeCrawlState(state);
    await writeProspectsDb({
      ...db,
      crawlState: serialized,
      updatedAt: new Date().toISOString(),
    });

    const pct = progressPct(state);
    return {
      ok: true,
      done: false,
      active: true,
      progressPct: pct,
      progressLabel: `${pct}%`,
      crawledPages: state.processedPages,
      discoveredCandidates: dedupCandidatesFromState(state).length,
      skippedAlreadyKnownDomains: 0,
      newCandidates: 0,
      updatedCandidates: 0,
      totalActiveCandidates: db.items.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const now = new Date().toISOString();

    await writeProspectsDb({
      ...db,
      crawlState: null,
      lastRun: {
        ranAt: now,
        startedAt: state.startedAt,
        ok: false,
        crawledPages: state.processedPages,
        discoveredCandidates: dedupCandidatesFromState(state).length,
        skippedAlreadyKnownDomains: 0,
        newCandidates: 0,
        updatedCandidates: 0,
        error: message,
      },
    });

    return {
      ok: false,
      done: true,
      active: false,
      progressPct: 100,
      progressLabel: "erro",
      crawledPages: state.processedPages,
      discoveredCandidates: 0,
      skippedAlreadyKnownDomains: 0,
      newCandidates: 0,
      updatedCandidates: 0,
      totalActiveCandidates: db.items.length,
      error: message,
    };
  }
}
