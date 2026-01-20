import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DB_PATH = path.join(process.cwd(), "public", "data", "references.json");
const BACKUP_PATH = path.join(process.cwd(), "public", "data", `references.backup.${Date.now()}.json`);
const REPORT_PATH = path.join(process.cwd(), "public", "data", "thumbnail-report.json");

const CONCURRENCY = 3;
const DELAY_MS = 450;
const TIMEOUT_MS = 12000;

const MAX_TO_PROCESS = 120;     // lote por rodada
const MAX_ATTEMPTS = 2;
const RETRY_AFTER_HOURS = 168; // 7 dias

const PROJECT_PAGES = [
  "/works",
  "/work",
  "/projects",
  "/project",
  "/portfolio",
  "/cases",
  "/case",
  "/selected-work",
  "/selected-works",
  "/archive",
  "/index",
  "/projects/all",
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function clean(v) { return (v ?? "").toString().trim(); }

function absolutize(baseUrl, maybeRelative) {
  try { return new URL(maybeRelative, baseUrl).toString(); }
  catch { return ""; }
}

function looksLikeImageFile(url) {
  const u = clean(url).toLowerCase();
  return (
    u.endsWith(".jpg") || u.endsWith(".jpeg") || u.endsWith(".png") || u.endsWith(".webp") ||
    u.includes(".jpg?") || u.includes(".jpeg?") || u.includes(".png?") || u.includes(".webp?")
  );
}

function isProbablyBadThumb(url) {
  const u = clean(url).toLowerCase();
  if (!u) return true;
  if (u.endsWith(".svg")) return true;

  const badTokens = [
    "logo","icon","favicon","mark","monogram","wordmark","brandmark",
    "social","share","opengraph","og-image","ogimage","twitter","meta-image",
    "default-share","site-image","placeholder","sprite","apple-touch-icon",
    "og", "open-graph", "social-card", "social-image", "share-image", "summary_large_image",
    "cdn-cgi", "cloudfront", "wp-content/uploads", "assets/og", "assets/social"
  ];
  if (badTokens.some(t => u.includes(t))) return true;
  return false;
}

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "referencias.work thumbnail bot (local dev)",
        "accept": "text/html,application/xhtml+xml",
      },
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("text/html")) return null;

    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function pickFromSrcset(srcset) {
  const s = clean(srcset);
  if (!s) return "";
  const parts = s.split(",").map(p => p.trim()).filter(Boolean);
  if (!parts.length) return "";
  const last = parts[parts.length - 1];
  const url = last.split(" ")[0];
  return clean(url);
}

function extractOgImage(html, pageUrl) {
  const $ = cheerio.load(html);
  const candidates = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
  ].map(clean).filter(Boolean);

  if (!candidates.length) return "";
  return absolutize(pageUrl, candidates[0]);
}

function extractImgCandidates($, pageUrl) {
  // img src / data-src / srcset / data-srcset
  const imgs = $("img").map((_, el) => {
    const $el = $(el);
    const src = clean($el.attr("src") || $el.attr("data-src") || "");
    const srcset = pickFromSrcset($el.attr("srcset") || $el.attr("data-srcset") || "");
    const chosen = srcset || src;
    const w = parseInt(clean($el.attr("width")), 10) || 0;
    const h = parseInt(clean($el.attr("height")), 10) || 0;
    const alt = clean($el.attr("alt") || "");
    return { abs: absolutize(pageUrl, chosen), w, h, alt, kind: "img" };
  }).get();

  // picture/source srcset (muito usado)
  const sources = $("picture source").map((_, el) => {
    const $el = $(el);
    const srcset = pickFromSrcset($el.attr("srcset") || "");
    return { abs: absolutize(pageUrl, srcset), w: 0, h: 0, alt: "", kind: "source" };
  }).get();

  return [...imgs, ...sources].filter(i => i.abs && !i.abs.startsWith("data:"));
}

function extractBgCandidates($, pageUrl) {
  const candidates = [];

  // style="background-image: url(...)"
  $("[style]").each((_, el) => {
    const style = clean($(el).attr("style"));
    const match = style.match(/background-image\s*:\s*url\(([^)]+)\)/i);
    if (match && match[1]) {
      const raw = match[1].replace(/['"]/g, "").trim();
      candidates.push({ abs: absolutize(pageUrl, raw), w: 0, h: 0, alt: "", kind: "bg-style" });
    }
  });

  // data-bg / data-background / data-image etc.
  const dataAttrs = ["data-bg", "data-background", "data-background-image", "data-image", "data-src"];
  for (const a of dataAttrs) {
    $(`[${a}]`).each((_, el) => {
      const raw = clean($(el).attr(a));
      if (raw) candidates.push({ abs: absolutize(pageUrl, raw), w: 0, h: 0, alt: "", kind: `bg-${a}` });
    });
  }

  return candidates.filter(i => i.abs && !i.abs.startsWith("data:"));
}

function scoreCandidate(c) {
  const u = (c.abs || "").toLowerCase();
  let score = 0;

  if (looksLikeImageFile(u)) score += 25;
  if (isProbablyBadThumb(u)) score -= 80;

  if (c.kind === "source") score += 8;      // geralmente é imagem boa
  if (c.kind.startsWith("bg")) score += 10; // bg costuma ser card de projeto

  if (c.w >= 600) score += 15;
  if (c.h >= 400) score += 10;
  if (c.w && c.w < 240) score -= 30;
  if (c.h && c.h < 180) score -= 30;

  const alt = (c.alt || "").toLowerCase();
  if (alt.includes("project") || alt.includes("work") || alt.includes("case")) score += 8;

  return score;
}

function pickBestProjectCandidate(html, pageUrl) {
  const $ = cheerio.load(html);
  const candidates = [
    ...extractImgCandidates($, pageUrl),
    ...extractBgCandidates($, pageUrl),
  ];

  if (!candidates.length) return "";

  const ranked = candidates
    .map(c => ({ ...c, score: scoreCandidate(c) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 10) return "";
  return best.abs;
}

async function findProjectThumbnail(baseUrl) {
  // tenta páginas de projetos primeiro
  for (const p of PROJECT_PAGES) {
    const pageUrl = absolutize(baseUrl, p);
    const html = await fetchHtml(pageUrl);
    await sleep(DELAY_MS);
    if (!html) continue;

    const img = pickBestProjectCandidate(html, pageUrl);
    if (img) return { thumbnailUrl: img, source: `project@${p}` };
  }

  // fallback: home
  const home = await fetchHtml(baseUrl);
  await sleep(DELAY_MS);
  if (home) {
    const img = pickBestProjectCandidate(home, baseUrl);
    if (img) return { thumbnailUrl: img, source: "project@home" };
  }

  return { thumbnailUrl: "", source: "" };
}

async function findFilteredOg(baseUrl) {
  const pages = ["", ...PROJECT_PAGES];
  for (const p of pages) {
    const pageUrl = p ? absolutize(baseUrl, p) : baseUrl;
    const html = await fetchHtml(pageUrl);
    await sleep(DELAY_MS);
    if (!html) continue;

    const og = extractOgImage(html, pageUrl);
    if (og && !isProbablyBadThumb(og)) {
      return { thumbnailUrl: og, source: `og@${p || "home"}` };
    }
  }
  return { thumbnailUrl: "", source: "" };
}

function loadDb() {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function hoursSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60);
}

async function run() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Não encontrei: ${DB_PATH}`);
    process.exit(1);
  }

  const db = loadDb();
  const items = db.items ?? [];

  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log(`✅ Backup: ${BACKUP_PATH}`);

  // fila incremental:
  // 1) sem imagem e nunca tentou
  // 2) sem imagem e tentou há muito tempo
  // 3) imagem ruim (logo/share) -> tenta melhorar
  const eligible = items.filter(i => {
    const attempts = Number(i.thumbnailAttempts || 0);
    const triedAt = i.thumbnailTriedAt || "";
    const source = i.thumbnailSource || "";

    const hasThumb = !!i.thumbnailUrl;
    const bad = hasThumb && isProbablyBadThumb(i.thumbnailUrl);

    if (bad) return true;

    if (!hasThumb) {
      if (attempts >= MAX_ATTEMPTS) return false;
      // se falhou recentemente, evita repetir na rodada seguinte
      if (source === "none" && hoursSince(triedAt) < RETRY_AFTER_HOURS) return false;
      return true;
    }

    return false;
  });

  // ordena para não começar sempre do começo:
  // prioriza: nunca tentado -> tentado há mais tempo
  eligible.sort((a, b) => {
    const aAtt = Number(a.thumbnailAttempts || 0);
    const bAtt = Number(b.thumbnailAttempts || 0);

    if (aAtt !== bAtt) return aAtt - bAtt; // menos tentativas primeiro

    const aT = a.thumbnailTriedAt ? new Date(a.thumbnailTriedAt).getTime() : 0;
    const bT = b.thumbnailTriedAt ? new Date(b.thumbnailTriedAt).getTime() : 0;
    return aT - bT; // mais antigo primeiro
  });

  const queue = eligible.slice(0, MAX_TO_PROCESS);
  console.log(`Elegíveis: ${eligible.length} | Lote: ${queue.length}`);

  const report = {
    processedAt: new Date().toISOString(),
    processed: 0,
    successProject: 0,
    successOg: 0,
    improvedFromBad: 0,
    failed: 0,
    samples: [],
    failures: []
  };

  let idx = 0;

  async function worker() {
    while (idx < queue.length) {
      const current = queue[idx++];
      const url = current.url;

      const hadBad = !!current.thumbnailUrl && isProbablyBadThumb(current.thumbnailUrl);

      // marca tentativa
      current.thumbnailAttempts = Number(current.thumbnailAttempts || 0) + 1;
      current.thumbnailTriedAt = new Date().toISOString();

      console.log(`→ [${idx}/${queue.length}] ${current.name}`);

      // 1) imagem de projeto
      const proj = await findProjectThumbnail(url);
      report.processed += 1;

      if (proj.thumbnailUrl) {
        current.thumbnailUrl = proj.thumbnailUrl;
        current.thumbnailSource = "project";
        report.successProject += 1;
        if (hadBad) report.improvedFromBad += 1;

        if (report.samples.length < 25) {
          report.samples.push({ name: current.name, url, thumbnailUrl: proj.thumbnailUrl, source: proj.source });
        }
        console.log(`   ✅ ${proj.source}`);
        continue;
      }

      // 2) fallback og (filtrado)
      const og = await findFilteredOg(url);
      if (og.thumbnailUrl) {
        current.thumbnailUrl = og.thumbnailUrl;
        current.thumbnailSource = "og";
        report.successOg += 1;
        if (hadBad) report.improvedFromBad += 1;

        if (report.samples.length < 25) {
          report.samples.push({ name: current.name, url, thumbnailUrl: og.thumbnailUrl, source: og.source });
        }
        console.log(`   ✅ ${og.source}`);
        continue;
      }

      // falhou
      current.thumbnailUrl = null;
      current.thumbnailSource = "none";
      report.failed += 1;
      report.failures.push({ name: current.name, url });

      console.log(`   ⚠️ none`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  db.updatedAt = new Date().toISOString();
  saveDb(db);

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(`\n✅ Atualizado: ${DB_PATH}`);
  console.log(`📄 Report: ${REPORT_PATH}`);
  console.log(`Project: ${report.successProject} | OG: ${report.successOg} | Improved: ${report.improvedFromBad} | Failed: ${report.failed}`);
}

run();
