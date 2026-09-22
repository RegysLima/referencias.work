import assert from "node:assert/strict";
import test from "node:test";
import {
  isRecognizedVideoUrl,
  hasStoredMediaProblem,
  validateMediaResponse,
} from "../src/lib/mediaHealth";

test("recognizes supported video URLs with query strings", () => {
  assert.equal(isRecognizedVideoUrl("https://cdn.example.com/project.mp4?v=2"), true);
  assert.equal(isRecognizedVideoUrl("https://cdn.example.com/project.jpg"), false);
});

test("accepts successful image and video responses", () => {
  assert.deepEqual(
    validateMediaResponse({
      status: 200,
      contentType: "image/webp",
      contentLength: 1200,
      url: "https://example.com/work.webp",
    }),
    { ok: true, reason: "ok" }
  );
  assert.equal(
    validateMediaResponse({
      status: 206,
      contentType: "video/mp4",
      contentLength: 1,
      url: "https://example.com/work.mp4",
    }).ok,
    true
  );
});

test("rejects empty, HTML, and failed media responses", () => {
  assert.equal(
    validateMediaResponse({
      status: 200,
      contentType: "text/html",
      contentLength: 100,
      url: "https://example.com/image.jpg",
    }).reason,
    "invalid_content_type"
  );
  assert.equal(
    validateMediaResponse({
      status: 200,
      contentType: "image/jpeg",
      contentLength: 0,
      url: "https://example.com/image.jpg",
    }).reason,
    "empty_file"
  );
  assert.equal(
    validateMediaResponse({
      status: 404,
      contentType: "image/jpeg",
      contentLength: 100,
      url: "https://example.com/image.jpg",
    }).reason,
    "http_error"
  );
});

test("distinguishes reviewable replacements from broken or missing media", () => {
  assert.equal(
    hasStoredMediaProblem({
      thumbnailUrl: "https://cdn.example.com/replacement.mp4",
      mediaReview: { outcome: "replaced" },
    }),
    false
  );
  assert.equal(
    hasStoredMediaProblem({ thumbnailUrl: null, mediaReview: { outcome: "missing" } }),
    true
  );
  assert.equal(hasStoredMediaProblem({ thumbnailUrl: "", mediaReview: undefined }), true);
});
