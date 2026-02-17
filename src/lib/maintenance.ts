export const NORMALIZE_FILTERS_STATUS_KEY = "maintenance:normalize-filters:last-run";

export type NormalizeFiltersStatus = {
  ranAt: string;
  total: number;
  changedItems: number;
  normalized: boolean;
  updatedAt: string | null;
  source: "cron" | "manual";
};
