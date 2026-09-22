import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMediaCandidates,
  extractProjectLinks,
  parseSitemapUrls,
  rankMediaCandidates,
} from "../src/lib/mediaDiscovery";

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

test("extracts responsive, CSS, metadata, and lazy-loaded media with provenance", () => {
  const candidates = extractMediaCandidates(
    "https://studio.example.com/work/alpha",
    `
      <meta property="og:video" content="/media/alpha.mp4">
      <picture>
        <source srcset="/media/alpha-small.webp 640w, /media/alpha-large.webp 1600w">
        <img data-lazy-src="/media/alpha.jpg" alt="Alpha campaign">
      </picture>
      <section style="background-image: url('/media/alpha-cover.avif')"></section>
      <style>.hero { background: url(\"/media/alpha-loop.gif\") center; }</style>
    `,
    "project"
  );

  assert.deepEqual(
    candidates.map(({ url, collector, mediaType }) => ({ url, collector, mediaType })),
    [
      {
        url: "https://studio.example.com/media/alpha.mp4",
        collector: "metadata",
        mediaType: "video",
      },
      {
        url: "https://studio.example.com/media/alpha-small.webp",
        collector: "html",
        mediaType: "image",
      },
      {
        url: "https://studio.example.com/media/alpha-large.webp",
        collector: "html",
        mediaType: "image",
      },
      {
        url: "https://studio.example.com/media/alpha.jpg",
        collector: "html",
        mediaType: "image",
      },
      {
        url: "https://studio.example.com/media/alpha-cover.avif",
        collector: "css",
        mediaType: "image",
      },
      {
        url: "https://studio.example.com/media/alpha-loop.gif",
        collector: "css",
        mediaType: "image",
      },
    ]
  );
});

test("extracts project media from JSON-LD and serialized framework data", () => {
  const candidates = extractMediaCandidates(
    "https://studio.example.com/projects/beta",
    `
      <script type="application/ld+json">
        {"@type":"VideoObject","contentUrl":"https://cdn.example.com/beta-film.webm","thumbnailUrl":"/media/beta-poster.jpg"}
      </script>
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"hero":"https:\\/\\/cdn.example.com\\/projects\\/beta.webp?width=1600\\u0026quality=90"}}}
      </script>
    `,
    "project"
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.url),
    [
      "https://cdn.example.com/beta-film.webm",
      "https://studio.example.com/media/beta-poster.jpg",
      "https://cdn.example.com/projects/beta.webp?width=1600&quality=90",
    ]
  );
  assert.equal(candidates[0]?.collector, "structured-data");
  assert.equal(candidates[2]?.collector, "serialized-data");
});

test("infers project links from visual cards on nonstandard routes", () => {
  const links = extractProjectLinks(
    "https://studio.example.com/archive",
    `
      <nav><a href="/about"><img src="/team.jpg"></a></nav>
      <main>
        <a href="/2026/alpha-campaign"><img src="/alpha.jpg"></a>
        <a href="/contact">Contact</a>
      </main>
    `,
    "https://studio.example.com"
  );

  assert.deepEqual(links, ["https://studio.example.com/2026/alpha-campaign"]);
});

test("parses sitemap indexes and URL sets", () => {
  assert.deepEqual(
    parseSitemapUrls(`
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://studio.example.com/</loc></url>
        <url><loc>https://studio.example.com/projects/gamma</loc></url>
      </urlset>
    `),
    ["https://studio.example.com/", "https://studio.example.com/projects/gamma"]
  );
});

test("returns a stable score and ranks richer project candidates first", () => {
  const ranked = rankMediaCandidates([
    {
      url: "https://studio.example.com/images/listing.jpg",
      sourcePageUrl: "https://studio.example.com/work",
      sourceKind: "listing",
      collector: "html",
      mediaType: "image",
    },
    {
      url: "https://cdn.example.com/project-film.mp4",
      sourcePageUrl: "https://studio.example.com/work/project-film",
      sourceKind: "project",
      collector: "structured-data",
      mediaType: "video",
    },
  ]);

  assert.equal(ranked[0]?.url, "https://cdn.example.com/project-film.mp4");
  assert.equal(typeof ranked[0]?.score, "number");
  assert.ok((ranked[0]?.score || 0) > (ranked[1]?.score || 0));
});
