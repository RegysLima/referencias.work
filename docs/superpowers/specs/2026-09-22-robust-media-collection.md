# Robust Media Collection Specification

**Date:** 2026-09-22

## Goal

Provide one reliable media-discovery service for manual thumbnail review, nightly repair, and future automated reference publishing. The service must find real project images and videos across static, CMS-driven, and JavaScript-rendered portfolio sites while keeping storage and browser usage within the Vercel Hobby constraints.

## Behavior

- Return multiple verified candidates instead of only a selected URL.
- Preserve each candidate's media type, source page, extraction method, and confidence score.
- Prefer project-detail media over listings and exclude logos, interface assets, trackers, and placeholders.
- Use inexpensive HTTP extraction first, including HTML media elements, responsive sources, metadata, CSS URLs, structured data, serialized framework data, and sitemaps.
- Use Browserbase and then Kernel only when HTTP extraction is blocked or yields no usable project media.
- Capture rendered DOM media and image/video network resources in browser mode.
- Bound page count, concurrency, timeouts, browser sessions, and returned candidates.
- Validate every URL before displaying or persisting it.
- Continue storing external URLs only; do not copy discovered media into the database or Blob storage.
- Keep the current admin API compatible while exposing candidate metadata for improved review.

## Cost Controls

- Browser fallback is opt-in per discovery attempt and only starts after the static pass fails.
- A browser session has a strict time budget and is always terminated in `finally`.
- Nightly maintenance uses the same fallback policy and does not revisit hidden references.
- Both remote providers use their free plans. No paid plan is enabled automatically.

## Acceptance Criteria

- Fixture tests cover responsive images, CSS backgrounds, JSON-LD, serialized framework data, project-link inference, and sitemap parsing.
- Existing media discovery and nightly maintenance tests remain green.
- The admin picker still receives URL candidates and also receives provenance metadata.
- A live smoke test succeeds on representative portfolio sites.
- A JavaScript-heavy or HTTP-blocked site invokes Browserbase fallback and returns verified project media, subject to the provider's free-tier anti-bot limits.
