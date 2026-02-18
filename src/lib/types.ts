export type Reference = {
  id: string;
  name: string;
  url: string;
  type: string;
  macroType: string;
  areaPrimary: string | null;
  areasSecondary: string[];
  tags: string[];
  country: string | null;
  city: string | null;
  locations?: Array<{
    country?: string | null;
    city?: string | null;
  }>;
  thumbnailUrl: string | null;
  thumbnailSource?: string | null;
  hidden?: boolean;
  updatedAt: string;
  reviewedAt?: string | null;
  reviewFlags?: {
    country?: boolean;
    city?: boolean;
  };
};

export type ReferenceDB = {
  count: number;
  items: Reference[];
  updatedAt?: string;
};

export type ProspectStatus = "new" | "approved" | "rejected";

export type ProspectSource = {
  siteId: string;
  sourcePageUrl: string;
  homepageUrl: string;
  label: string | null;
};

export type ProspectItem = {
  id: string;
  domain: string;
  displayName: string | null;
  homepageUrl: string | null;
  status: ProspectStatus;
  notes: string | null;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  sources: ProspectSource[];
};

export type ProspectCandidate = {
  domain: string;
  homepageUrl: string;
  displayName: string | null;
  sourceSite: string;
  sourcePageUrl: string;
  score: number;
};

export type ProspectsLastRun = {
  ranAt: string;
  startedAt: string;
  ok: boolean;
  crawledPages: number;
  discoveredCandidates: number;
  skippedAlreadyKnownDomains: number;
  newCandidates: number;
  updatedCandidates: number;
  error: string | null;
};

export type ProspectsDB = {
  count: number;
  items: ProspectItem[];
  updatedAt: string | null;
  lastRun: ProspectsLastRun | null;
  crawlState?: {
    active: boolean;
    startedAt: string;
    updatedAt: string;
    processedPages: number;
    totalPlannedPages: number;
    siteIndex: number;
    sites: Array<{
      siteId: string;
      siteUrl: string;
      queue: string[];
      queuedSet: string[];
      visitedSet: string[];
      candidates: Record<string, ProspectCandidate>;
    }>;
  } | null;
};
