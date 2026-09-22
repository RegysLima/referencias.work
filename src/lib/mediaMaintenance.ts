import { kv } from "@vercel/kv";
import { discoverReplacementMedia } from "./mediaDiscovery";
import { checkRemoteMedia, mapWithConcurrency } from "./mediaHealth";
import {
  MEDIA_MAINTENANCE_LOCK_KEY,
  MEDIA_MAINTENANCE_STATUS_KEY,
  type MediaMaintenanceStatus,
} from "./maintenance";
import { readReferencesDb, writeReferencesDb } from "./referencesDb";
import { sendMediaReviewEmail, type MediaReviewEmailItem } from "./mediaReviewEmail";
import type { Reference, ReferenceDB } from "./types";

export type MediaMaintenanceOutcome = {
  id: string;
  outcome: "replaced" | "missing";
  reason: string;
  previousUrl: string;
  replacementUrl: string | null;
  sourcePageUrl: string | null;
};

export function applyMediaMaintenanceResults(
  db: ReferenceDB,
  outcomes: MediaMaintenanceOutcome[],
  ranAt: string
): ReferenceDB {
  if (!outcomes.length) return db;
  const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  let changed = false;

  const items = db.items.map((item) => {
    const outcome = byId.get(item.id);
    if (!outcome) return item;
    changed = true;
    return {
      ...item,
      thumbnailUrl: outcome.replacementUrl,
      thumbnailSource: outcome.outcome === "replaced" ? "automation" : "automation-missing",
      hidden: true,
      reviewedAt: null,
      reviewFlags: { ...item.reviewFlags, media: true },
      mediaReview: {
        outcome: outcome.outcome,
        previousUrl: outcome.previousUrl,
        replacementUrl: outcome.replacementUrl,
        sourcePageUrl: outcome.sourcePageUrl,
        reason: outcome.reason,
        detectedAt: ranAt,
        notifiedAt: null,
        reviewedAt: null,
      },
      updatedAt: ranAt,
    };
  });

  if (!changed) return db;
  return {
    ...db,
    items,
    count: items.length,
    updatedAt: ranAt,
  };
}

const KV_ENABLED = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function acquireLock(runId: string) {
  if (!KV_ENABLED) return true;
  const result = await kv.set(MEDIA_MAINTENANCE_LOCK_KEY, runId, { nx: true, ex: 900 });
  return result === "OK";
}

async function releaseLock(runId: string) {
  if (!KV_ENABLED) return;
  const current = await kv.get<string>(MEDIA_MAINTENANCE_LOCK_KEY);
  if (current === runId) await kv.del(MEDIA_MAINTENANCE_LOCK_KEY);
}

async function saveStatus(status: MediaMaintenanceStatus, dryRun: boolean) {
  if (KV_ENABLED && !dryRun) await kv.set(MEDIA_MAINTENANCE_STATUS_KEY, status);
}

function excludedMediaUrls(reference: Reference) {
  return new Set(
    [
      reference.thumbnailUrl,
      reference.mediaReview?.previousUrl,
      reference.mediaReview?.replacementUrl,
    ].filter((value): value is string => Boolean(value))
  );
}

export type RunMediaMaintenanceOptions = {
  source: "cron" | "manual";
  origin: string;
  dryRun?: boolean;
  scanLimit?: number;
};

export async function runMediaMaintenance(options: RunMediaMaintenanceOptions) {
  const ranAt = new Date().toISOString();
  const runId = `media-${ranAt.replace(/[:.]/g, "-")}`;
  const dryRun = Boolean(options.dryRun);
  const locked = await acquireLock(runId);
  if (!locked) throw new Error("media_maintenance_already_running");

  let totalReferences = 0;
  let checkedReferences = 0;
  let brokenReferences = 0;
  let replacedReferences = 0;
  let missingReferences = 0;
  let emailSent = false;

  try {
    const db = await readReferencesDb();
    totalReferences = db.items.length;
    const eligibleItems = db.items.filter(
      (item) => !item.hidden && Boolean(item.thumbnailUrl?.trim())
    );
    const eligible = options.scanLimit
      ? eligibleItems.slice(0, options.scanLimit)
      : eligibleItems;
    checkedReferences = eligible.length;

    const healthResults = await mapWithConcurrency(eligible, 24, async (item) => ({
      item,
      health: await checkRemoteMedia(item.thumbnailUrl || "", { timeoutMs: 6500 }),
    }));
    const broken = healthResults.filter((result) => !result.health.ok);
    brokenReferences = broken.length;

    const outcomes = await mapWithConcurrency(broken, 6, async ({ item, health }, index) => {
      const previousUrl = item.thumbnailUrl || "";
      const replacement = await discoverReplacementMedia(item.url, excludedMediaUrls(item), {
        // Keep the nightly run inside the free browser allowance and function duration.
        browserFallback: index < 4,
      });
      if (replacement) {
        const verification = await checkRemoteMedia(replacement.url, { timeoutMs: 6500 });
        if (verification.ok) {
          return {
            id: item.id,
            outcome: "replaced" as const,
            reason: health.reason,
            previousUrl,
            replacementUrl: replacement.url,
            sourcePageUrl: replacement.sourcePageUrl,
          };
        }
      }
      return {
        id: item.id,
        outcome: "missing" as const,
        reason: health.reason,
        previousUrl,
        replacementUrl: null,
        sourcePageUrl: null,
      };
    });

    replacedReferences = outcomes.filter((outcome) => outcome.outcome === "replaced").length;
    missingReferences = outcomes.filter((outcome) => outcome.outcome === "missing").length;
    let updatedDb = applyMediaMaintenanceResults(db, outcomes, ranAt);

    if (!dryRun && outcomes.length) {
      await writeReferencesDb(updatedDb);
    }

    if (!dryRun) {
      const pendingNotificationItems = updatedDb.items.filter(
        (item) =>
          item.hidden &&
          item.reviewFlags?.media === true &&
          item.mediaReview &&
          !item.mediaReview.notifiedAt
      );
      const emailItems: MediaReviewEmailItem[] = pendingNotificationItems.map((item) => ({
        id: item.id,
        name: item.name || item.id,
        referenceUrl: item.url || "",
        outcome: item.mediaReview?.outcome || "missing",
        previousUrl: item.mediaReview?.previousUrl || "",
        replacementUrl: item.mediaReview?.replacementUrl || null,
      }));
      const email = await sendMediaReviewEmail(
        {
          ranAt,
          adminUrl: `${options.origin.replace(/\/$/, "")}/admin?review=media`,
          items: emailItems,
        },
        `media-review-${ranAt.slice(0, 10)}`
      );
      emailSent = email.sent;
      if (email.sent) {
        const notifiedIds = new Set(pendingNotificationItems.map((item) => item.id));
        updatedDb = {
          ...updatedDb,
          items: updatedDb.items.map((item) =>
            notifiedIds.has(item.id) && item.mediaReview
              ? {
                  ...item,
                  mediaReview: { ...item.mediaReview, notifiedAt: new Date().toISOString() },
                }
              : item
          ),
        };
        await writeReferencesDb(updatedDb);
      }
    }

    const status: MediaMaintenanceStatus = {
      runId,
      source: options.source,
      ranAt,
      completedAt: new Date().toISOString(),
      totalReferences,
      checkedReferences,
      brokenReferences,
      replacedReferences,
      missingReferences,
      emailSent,
      error: null,
    };
    await saveStatus(status, dryRun);
    return { ...status, dryRun, outcomes };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const status: MediaMaintenanceStatus = {
      runId,
      source: options.source,
      ranAt,
      completedAt: new Date().toISOString(),
      totalReferences,
      checkedReferences,
      brokenReferences,
      replacedReferences,
      missingReferences,
      emailSent,
      error: message,
    };
    await saveStatus(status, dryRun);
    throw error;
  } finally {
    await releaseLock(runId);
  }
}
