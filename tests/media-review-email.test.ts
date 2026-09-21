import assert from "node:assert/strict";
import test from "node:test";
import { renderMediaReviewEmail, renderMediaReviewText } from "../src/lib/mediaReviewEmail";

test("renders replaced and unresolved references in the review digest", () => {
  const html = renderMediaReviewEmail({
    ranAt: "2026-09-21T07:00:00.000Z",
    adminUrl: "https://referencias.work/admin?review=media",
    items: [
      {
        id: "one",
        name: "Studio One",
        referenceUrl: "https://one.example.com",
        outcome: "replaced",
        previousUrl: "https://one.example.com/old.jpg",
        replacementUrl: "https://one.example.com/new.jpg",
      },
      {
        id: "two",
        name: "Studio Two",
        referenceUrl: "https://two.example.com",
        outcome: "missing",
        previousUrl: "https://two.example.com/old.jpg",
        replacementUrl: null,
      },
    ],
  });

  assert.match(html, /referencias\.work/);
  assert.match(html, /2 referências aguardam revisão/);
  assert.match(html, /Studio One/);
  assert.match(html, /Mídia substituída/);
  assert.match(html, /Studio Two/);
  assert.match(html, /Sem substituição automática/);
  assert.match(html, /https:\/\/referencias\.work\/admin\?review=media/);
});

test("escapes reference content before rendering", () => {
  const html = renderMediaReviewEmail({
    ranAt: "2026-09-21T07:00:00.000Z",
    adminUrl: "https://referencias.work/admin",
    items: [
      {
        id: "unsafe",
        name: "<script>alert(1)</script>",
        referenceUrl: "https://example.com/?a=1&b=2",
        outcome: "missing",
        previousUrl: "https://example.com/old.jpg",
        replacementUrl: null,
      },
    ],
  });

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /a=1&amp;b=2/);
});

test("renders video replacements as links instead of broken image previews", () => {
  const html = renderMediaReviewEmail({
    ranAt: "2026-09-21T07:00:00.000Z",
    adminUrl: "https://referencias.work/admin?review=media",
    items: [
      {
        id: "video",
        name: "Video Studio",
        referenceUrl: "https://studio.example.com",
        outcome: "replaced",
        previousUrl: "https://studio.example.com/old.jpg",
        replacementUrl: "https://cdn.example.com/project.mp4",
      },
    ],
  });

  assert.match(html, /VÍDEO DE PROJETO SELECIONADO/);
  assert.doesNotMatch(html, /<img src="https:\/\/cdn\.example\.com\/project\.mp4"/);
});

test("renders a plain-text fallback with the review link", () => {
  const text = renderMediaReviewText({
    ranAt: "2026-09-21T07:00:00.000Z",
    adminUrl: "https://referencias.work/admin?review=media",
    items: [
      {
        id: "missing",
        name: "Missing Studio",
        referenceUrl: "https://studio.example.com",
        outcome: "missing",
        previousUrl: "https://studio.example.com/old.jpg",
        replacementUrl: null,
      },
    ],
  });

  assert.match(text, /Sem substituição automática/);
  assert.match(text, /https:\/\/referencias\.work\/admin\?review=media/);
});
