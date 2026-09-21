# Daily Media Maintenance Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with tests and verification at each boundary.

**Goal:** Check public reference media every night, replace broken external media with a verified project image or video, hide changed references for review, and email one branded review digest.

**Architecture:** A protected Vercel Cron route runs an idempotent maintenance service. Shared media-health and discovery modules power both the cron and the existing admin endpoints; KV stores the updated references, a distributed lock, and the latest run status. Replacements remain external URLs, while a bounded audit record preserves the previous URL and discovery source.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vercel Cron, Vercel KV, Resend, React Email, Node test runner with `tsx`.

**Spec:** User-approved conversation requirements from 2026-09-21.

## Global Constraints

- Run daily around 04:00 America/Sao_Paulo (`0 7 * * *`, Vercel UTC; Hobby may run within the hour).
- Process only public references; never reprocess hidden references awaiting review.
- Store only external media URLs and bounded audit metadata; do not copy automated replacements to Blob.
- Hide every reference whose existing media is confirmed broken, including when no replacement is found.
- Send one HTML email only when references require review.
- Use `regyslima07@gmail.com` as recipient and `Referencias.work <alertas@referencias.work>` as sender.
- Protect cron access with `CRON_SECRET`, prevent overlapping runs, and make retries idempotent.

---

### Task 1: Test Harness and Persistent Types

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/maintenance.ts`
- Test: `tests/media-maintenance.test.ts`

**Interfaces:**
- Produces: `MediaReview`, `MediaMaintenanceStatus`, and media-aware `reviewFlags`.

- [ ] Add `tsx` as a development dependency and a `test` script using Node's test runner.
- [ ] Write tests for applying replaced and missing media outcomes to references.
- [ ] Run tests and confirm they fail before implementation.
- [ ] Add bounded media-review and maintenance-status types.
- [ ] Run tests and TypeScript checks.

### Task 2: Shared Media Health and Discovery

**Files:**
- Create: `src/lib/mediaHealth.ts`
- Create: `src/lib/mediaDiscovery.ts`
- Modify: `src/app/api/admin/check-images/route.ts`
- Modify: `src/app/api/admin/thumbs/route.ts`
- Test: `tests/media-health.test.ts`
- Test: `tests/media-discovery.test.ts`

**Interfaces:**
- Produces: `checkRemoteMedia(url, options)`, `checkRemoteMediaBatch(items)`, and `discoverReplacementMedia(referenceUrl, excludedUrls)`.
- Consumes: browser-like request headers, bounded concurrency, and timeouts.

- [ ] Write failing tests for URL classification, media response validation, garbage filtering, and project-page candidate priority.
- [ ] Extract the existing health checker into a reusable server module.
- [ ] Extract and tighten media discovery so project pages outrank generic pages.
- [ ] Keep the existing admin APIs as thin wrappers around the shared modules.
- [ ] Run focused tests, lint, and TypeScript checks.

### Task 3: Idempotent Maintenance Service

**Files:**
- Create: `src/lib/mediaMaintenance.ts`
- Test: `tests/media-maintenance.test.ts`

**Interfaces:**
- Produces: `runMediaMaintenance({ source, origin })` and `applyMediaMaintenanceResults(db, results, ranAt)`.
- Consumes: reference DB, media health checks, discovery, KV lock/status, and email sender.

- [ ] Write failing tests for visible-only scans, replacement, no-replacement hiding, audit metadata, and duplicate-run safety.
- [ ] Implement bounded concurrent health checks and replacement discovery.
- [ ] Revalidate every selected replacement before committing it.
- [ ] Update the reference DB once per run and store the latest status in KV.
- [ ] Add a KV lock with expiry and deterministic run/date identifiers.
- [ ] Run focused tests.

### Task 4: Branded Review Email

**Files:**
- Create: `src/emails/MediaReviewEmail.tsx`
- Create: `src/lib/mediaReviewEmail.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/media-review-email.test.ts`

**Interfaces:**
- Produces: `sendMediaReviewEmail(report)`.
- Consumes: `RESEND_API_KEY`, `MEDIA_REVIEW_EMAIL_TO`, `MEDIA_REVIEW_EMAIL_FROM`, and a deterministic idempotency key.

- [ ] Write a failing render test for replaced and unresolved reference rows.
- [ ] Implement a black-and-white React Email template matching the site's visual system.
- [ ] Include old/new media, reference URL, result reason, and a direct admin link.
- [ ] Send only when at least one reference was hidden for review.
- [ ] Run render tests and TypeScript checks.

### Task 5: Cron Route and Admin Review State

**Files:**
- Create: `src/app/api/cron/media-health/route.ts`
- Modify: `src/app/admin/(protected)/page.tsx`
- Modify: `src/lib/referenceNormalization.ts`
- Modify: `vercel.json`
- Test: `tests/media-maintenance.test.ts`

**Interfaces:**
- Produces: protected daily GET endpoint and media-aware review UI behavior.
- Consumes: `runMediaMaintenance` and existing “Revisado” action.

- [ ] Add strict `CRON_SECRET` authorization and a 300-second maximum duration.
- [ ] Add the `0 7 * * *` production schedule without changing the existing normalization cron.
- [ ] Preserve `reviewFlags.media` during normalization.
- [ ] Make the existing review filter include media review items.
- [ ] Make “Revisado” clear the media flag and unhide the reference while retaining bounded audit details.
- [ ] Run tests, lint, TypeScript, and production build.

### Task 6: Production Integration and Verification

**Files:**
- No tracked source files beyond prior tasks.

**Interfaces:**
- Consumes: linked Vercel project `referencias-work-mirror`.

- [ ] Install the Resend Marketplace integration and verify `referencias.work` for sending.
- [ ] Configure `MEDIA_REVIEW_EMAIL_TO` and `MEDIA_REVIEW_EMAIL_FROM` in Vercel environments.
- [ ] Trigger the cron endpoint manually against production with safe idempotency controls.
- [ ] Verify KV status, hidden/review state, and email delivery.
- [ ] Commit, push `main`, wait for Vercel `production` status `Ready`, and inspect registered cron jobs.

