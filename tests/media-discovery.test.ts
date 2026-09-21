import assert from "node:assert/strict";
import test from "node:test";
import { rankMediaCandidates } from "../src/lib/mediaDiscovery";

test("prioritizes project-page media over generic homepage media", () => {
  const ranked = rankMediaCandidates([
    {
      url: "https://studio.example.com/images/home-hero.jpg",
      sourcePageUrl: "https://studio.example.com/",
      sourceKind: "generic",
    },
    {
      url: "https://studio.example.com/uploads/case-study.jpg",
      sourcePageUrl: "https://studio.example.com/projects/case-study",
      sourceKind: "project",
    },
  ]);

  assert.equal(ranked[0]?.url, "https://studio.example.com/uploads/case-study.jpg");
});

test("removes logos, icons, duplicate URLs, and excluded media", () => {
  const ranked = rankMediaCandidates(
    [
      {
        url: "https://studio.example.com/logo.svg",
        sourcePageUrl: "https://studio.example.com/projects/a",
        sourceKind: "project",
      },
      {
        url: "https://studio.example.com/work/a.jpg",
        sourcePageUrl: "https://studio.example.com/projects/a",
        sourceKind: "project",
      },
      {
        url: "https://studio.example.com/work/a.jpg",
        sourcePageUrl: "https://studio.example.com/projects/b",
        sourceKind: "project",
      },
    ],
    new Set(["https://studio.example.com/work/a.jpg"])
  );

  assert.deepEqual(ranked, []);
});

test("does not use generic homepage media as a replacement", () => {
  const ranked = rankMediaCandidates([
    {
      url: "https://studio.example.com/images/home-hero.jpg",
      sourcePageUrl: "https://studio.example.com/",
      sourceKind: "generic",
    },
  ]);

  assert.deepEqual(ranked, []);
});

test("excludes SVG and interface assets from replacement candidates", () => {
  const ranked = rankMediaCandidates([
    {
      url: "https://studio.example.com/assets/burger.svg",
      sourcePageUrl: "https://studio.example.com/work",
      sourceKind: "listing",
    },
    {
      url: "https://studio.example.com/assets/project-arrow.png",
      sourcePageUrl: "https://studio.example.com/work",
      sourceKind: "listing",
    },
  ]);

  assert.deepEqual(ranked, []);
});
