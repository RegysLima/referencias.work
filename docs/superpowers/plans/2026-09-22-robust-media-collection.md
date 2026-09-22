# Robust Media Collection Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with tests and verification at each boundary.

**Goal:** Build a shared, explainable media collector that reliably finds project images and videos for manual review, nightly repair, and future automated publishing.

**Architecture:** A staged discovery pipeline performs broad static extraction and project-page discovery first, validates and ranks structured candidates, then uses short-lived Browserbase and Kernel sessions only when cheaper stages do not produce verified media. The existing admin and maintenance flows consume the same service.

**Tech Stack:** Next.js 16 App Router, TypeScript, Cheerio, Browserbase, Kernel, Playwright, Node test runner with `tsx`, Vercel Functions.

**Spec:** `docs/superpowers/specs/2026-09-22-robust-media-collection.md`

### Task 1: Structured Static Discovery

**Files:**
- Modify: `src/lib/mediaDiscovery.ts`
- Modify: `tests/media-discovery.test.ts`

- [x] Add candidate media type, collector, and score metadata.
- [x] Write failing fixtures for responsive sources, CSS, structured data, and serialized URLs.
- [x] Expand extraction while retaining garbage filtering and URL normalization.
- [x] Expand project-link inference for visual cards and nonstandard portfolio routes.
- [x] Add bounded sitemap parsing and project URL selection.

### Task 2: Remote Browser Fallback

**Files:**
- Create: `src/lib/browserMediaDiscovery.ts`
- Modify: `src/lib/mediaDiscovery.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/browser-media-discovery.test.ts`

- [x] Connect the Browserbase and Kernel Marketplace resources on their free plans.
- [x] Add provider SDKs and Playwright using the official integration guidance.
- [x] Collect rendered DOM media and image/video performance resources.
- [x] Enforce one session, bounded navigation/scrolling, and unconditional cleanup.
- [x] Invoke fallback only when static discovery returns no verified candidates.

### Task 3: Admin Diagnostics

**Files:**
- Modify: `src/app/api/admin/thumbs/route.ts`
- Modify: `src/app/admin/(protected)/page.tsx`

- [x] Preserve the URL-only response for compatibility and add candidate details.
- [x] Display source type and extraction method in the media picker.
- [x] Report whether deep browser collection ran or could not run.
- [x] Keep image and video previews selectable with the current workflow.

### Task 4: Shared Automation Integration

**Files:**
- Modify: `src/lib/mediaMaintenance.ts`
- Modify: `tests/media-maintenance.test.ts`

- [x] Route nightly replacement discovery through the staged collector.
- [x] Store bounded provenance in the media review audit record.
- [x] Ensure a browser failure degrades to an unresolved review item, never a failed cron run.

### Task 5: Verification and Production

- [x] Run tests, lint, TypeScript, and production build.
- [x] Run live discovery against the reviewed portfolio corpus, including Nomad.
- [ ] Deploy through `main`, wait for Vercel `Ready`, and smoke-test the production admin API.
- [x] Confirm Browserbase and Kernel usage stays bounded for their configured free plans.
