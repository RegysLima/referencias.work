import assert from "node:assert/strict";
import test from "node:test";
import { applyMediaMaintenanceResults } from "../src/lib/mediaMaintenance";
import { normalizeReferenceDb } from "../src/lib/referenceNormalization";
import type { ReferenceDB } from "../src/lib/types";

const NOW = "2026-09-21T07:00:00.000Z";

function makeDb(): ReferenceDB {
  return {
    count: 2,
    updatedAt: "2026-09-20T00:00:00.000Z",
    items: [
      {
        id: "visible",
        name: "Visible Studio",
        url: "https://visible.example.com",
        type: "Studios",
        macroType: "Studios",
        areaPrimary: "Branding",
        areasSecondary: [],
        tags: ["Branding"],
        country: null,
        city: null,
        thumbnailUrl: "https://visible.example.com/broken.jpg",
        hidden: false,
        updatedAt: "2026-09-20T00:00:00.000Z",
        reviewedAt: "2026-09-20T00:00:00.000Z",
      },
      {
        id: "hidden",
        name: "Hidden Studio",
        url: "https://hidden.example.com",
        type: "Studios",
        macroType: "Studios",
        areaPrimary: "Branding",
        areasSecondary: [],
        tags: ["Branding"],
        country: null,
        city: null,
        thumbnailUrl: "https://hidden.example.com/old.jpg",
        hidden: true,
        updatedAt: "2026-09-20T00:00:00.000Z",
        reviewedAt: null,
      },
    ],
  };
}

test("applies a verified replacement and marks the reference for review", () => {
  const db = applyMediaMaintenanceResults(
    makeDb(),
    [
      {
        id: "visible",
        outcome: "replaced",
        reason: "http_error",
        previousUrl: "https://visible.example.com/broken.jpg",
        replacementUrl: "https://visible.example.com/projects/new.jpg",
        sourcePageUrl: "https://visible.example.com/projects/new",
      },
    ],
    NOW
  );
  const item = db.items[0];

  assert.equal(item.thumbnailUrl, "https://visible.example.com/projects/new.jpg");
  assert.equal(item.hidden, true);
  assert.equal(item.reviewedAt, null);
  assert.equal(item.reviewFlags?.media, true);
  assert.equal(item.mediaReview?.outcome, "replaced");
  assert.equal(item.mediaReview?.previousUrl, "https://visible.example.com/broken.jpg");
  assert.equal(item.updatedAt, NOW);
});

test("hides a reference when no replacement is available", () => {
  const db = applyMediaMaintenanceResults(
    makeDb(),
    [
      {
        id: "visible",
        outcome: "missing",
        reason: "request_failed",
        previousUrl: "https://visible.example.com/broken.jpg",
        replacementUrl: null,
        sourcePageUrl: null,
      },
    ],
    NOW
  );
  const item = db.items[0];

  assert.equal(item.thumbnailUrl, null);
  assert.equal(item.hidden, true);
  assert.equal(item.reviewFlags?.media, true);
  assert.equal(item.mediaReview?.outcome, "missing");
});

test("does not mutate unrelated hidden references", () => {
  const before = makeDb();
  const hiddenBefore = structuredClone(before.items[1]);
  const db = applyMediaMaintenanceResults(before, [], NOW);

  assert.deepEqual(db.items[1], hiddenBefore);
  assert.equal(db.updatedAt, before.updatedAt);
});

test("preserves the media review flag during nightly normalization", () => {
  const db = makeDb();
  db.items[0].reviewFlags = { media: true };
  db.items[0].locationNA = true;
  const normalized = normalizeReferenceDb(db).db;

  assert.equal(normalized.items[0].reviewFlags?.media, true);
});
