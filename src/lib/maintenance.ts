export const NORMALIZE_FILTERS_STATUS_KEY = "maintenance:normalize-filters:last-run";
export const MEDIA_MAINTENANCE_STATUS_KEY = "maintenance:media:last-run";
export const MEDIA_MAINTENANCE_LOCK_KEY = "maintenance:media:lock";

export type NormalizeFiltersStatus = {
  ranAt: string;
  total: number;
  changedItems: number;
  normalized: boolean;
  updatedAt: string | null;
  source: "cron" | "manual";
};

export type MediaMaintenanceStatus = {
  runId: string;
  source: "cron" | "manual";
  ranAt: string;
  completedAt: string;
  totalReferences: number;
  checkedReferences: number;
  brokenReferences: number;
  replacedReferences: number;
  missingReferences: number;
  emailSent: boolean;
  error: string | null;
};
