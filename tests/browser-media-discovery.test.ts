import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrowserMedia } from "../src/lib/browserMediaDiscovery";

test("normalizes rendered and network media while retaining MIME-derived types", () => {
  const candidates = normalizeBrowserMedia(
    "https://studio.example.com/projects/alpha",
    [
      { url: "/media/hero.jpg" },
      { url: "https://cdn.example.com/playback/123", contentType: "video/mp4" },
      { url: "data:image/png;base64,ignored" },
      { url: "https://studio.example.com/media/hero.jpg", contentType: "image/jpeg" },
      { url: "https://studio.example.com/app.js", contentType: "application/javascript" },
    ]
  );

  assert.deepEqual(candidates, [
    {
      url: "https://studio.example.com/media/hero.jpg",
      sourcePageUrl: "https://studio.example.com/projects/alpha",
      sourceKind: "project",
      collector: "browser",
      mediaType: "image",
    },
    {
      url: "https://cdn.example.com/playback/123",
      sourcePageUrl: "https://studio.example.com/projects/alpha",
      sourceKind: "project",
      collector: "browser",
      mediaType: "video",
    },
  ]);
});

test("marks root-page browser media as generic", () => {
  const [candidate] = normalizeBrowserMedia("https://studio.example.com/", [
    { url: "https://studio.example.com/cover.webp", contentType: "image/webp" },
  ]);

  assert.equal(candidate?.sourceKind, "generic");
});

test("distinguishes browser listing pages from project detail pages", () => {
  const [listing] = normalizeBrowserMedia("https://studio.example.com/work", [
    { url: "/media/grid.jpg", contentType: "image/jpeg" },
  ]);
  const [project] = normalizeBrowserMedia("https://studio.example.com/work/alpha", [
    { url: "/media/alpha.jpg", contentType: "image/jpeg" },
  ]);

  assert.equal(listing?.sourceKind, "listing");
  assert.equal(project?.sourceKind, "project");
});
