import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "public", "data", "references.json");
const BACKUP_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  `references.backup.thumbs-deep.${Date.now()}.json`
);
const REPORT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  `thumbnail-deep-report-${Date.now()}.json`
);

const CONCURRENCY = 3;
const DELAY_MS = 350;
const TIMEOUT_MS = 9000;
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 0);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 80);
const PAUSE_BETWEEN_BATCHES_MS = Number(process.env.PAUSE_BETWEEN_BATCHES_MS || 800);

const DEFAULT_PAGES = [
  "",
  "/projects",
  "/project",
  "/work",
  "/works",
  "/portfolio",
  "/cases",
  "/case-studies",
  "/case-study",
  "/index",
  "/projetos",
  "/projeto",
  "/trabalhos",
  "/trabalho",
  "/portifolio",
  "/portfólio",
  "/sobre",
  "/about",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeBaseUrl(input) {
  const u = new URL(input);
  u.hash = "";
  u.search = "";
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.toString();
}

function absUrl(base, maybe) {
  try {
    return new URL(maybe, base).toString();
  } catch {
    return "";
  }
}

function uniq(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const v = (s || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function looksLikeImage(url) {
  const u = url.toLowerCase();
  if (u.startsWith("data:")) return false;
  return (
    u.includes(".jpg") ||
    u.includes(".jpeg") ||
    u.includes(".png") ||
    u.includes(".webp") ||
    u.includes(".gif") ||
    u.includes("wp-content/uploads") ||
    u.includes("/uploads/") ||
    u.includes("/images/") ||
    u.includes("image")
  );
}

function isLikelyGarbage(url) {
  const u = url.toLowerCase();
  return (
    u.includes("logo") ||
    u.includes("favicon") ||
    u.includes("sprite") ||
    u.includes("icon") ||
    u.includes("analytics") ||
    u.includes("doubleclick") ||
    u.includes("pixel") ||
    u.includes("tracking")
  );
}

function scoreImage(url) {
  const u = url.toLowerCase();
  let score = 0;

  if (u.includes("wp-content/uploads")) score += 7;
  if (u.includes("/uploads/")) score += 5;
  if (u.includes("/images/")) score += 3;
  if (u.includes("cdn")) score += 2;

  if (u.includes("work") || u.includes("project") || u.includes("case") || u.includes("portfolio"))
    score += 3;

  if (isLikelyGarbage(u)) score -= 10;

  if (u.includes(".webp")) score += 1;
  if (u.includes(".jpg") || u.includes(".jpeg") || u.includes(".png")) score += 1;

  return score;
}

async function fetchText(url, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8,es;q=0.7",
      },
    });

    if (!res.ok) throw new Error(`HTTP_${res.status}`);

    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    return { text, contentType: ct };
  } finally {
    clearTimeout(t);
  }
}

function extractFromHtml(pageUrl, html) {
  const out = [];

  {
    const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (og?.[1]) {
      const u = absUrl(pageUrl, og[1]);
      if (u) out.push(u);
    }
  }

  {
    const tw = html.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
    if (tw?.[1]) {
      const u = absUrl(pageUrl, tw[1]);
      if (u) out.push(u);
    }
  }

  {
    const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(html))) {
      const u = absUrl(pageUrl, m[1]);
      if (u) out.push(u);
    }
  }

  {
    const re = /<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(html))) {
      const u = absUrl(pageUrl, m[1]);
      if (u) out.push(u);
    }
  }

  {
    const re = /<img[^>]+(?:srcset|data-srcset)=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(html))) {
      const parts = (m[1] || "")
        .split(",")
        .map((x) => x.trim().split(/\s+/)[0])
        .filter(Boolean);
      for (const p of parts) {
        const u = absUrl(pageUrl, p);
        if (u) out.push(u);
      }
    }
  }

  {
    const re = /background-image\s*:\s*url\(([^)]+)\)/gi;
    let m;
    while ((m = re.exec(html))) {
      const raw = (m[1] || "").trim().replace(/^['"]|['"]$/g, "");
      const u = absUrl(pageUrl, raw);
      if (u) out.push(u);
    }
  }

  {
    const re = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(html))) {
      const u = absUrl(pageUrl, m[1]);
      if (u) out.push(u);
    }
  }

  {
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
      const chunk = m[1] || "";
      const urlRe = /"([^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/gi;
      let u;
      while ((u = urlRe.exec(chunk))) {
        const abs = absUrl(pageUrl, u[1]);
        if (abs) out.push(abs);
      }
    }
  }

  return out;
}

async function tryWpJsonMedia(base) {
  const results = [];
  const wpCandidates = [
    `${base.replace(/\/$/, "")}/wp-json/wp/v2/media?per_page=50&page=1`,
    `${base.replace(/\/$/, "")}/wp-json/wp/v2/media?per_page=50&page=2`,
  ];

  for (const url of wpCandidates) {
    try {
      const { text, contentType } = await fetchText(url, 9000);
      if (!contentType.toLowerCase().includes("application/json")) continue;
      const json = JSON.parse(text);
      if (!Array.isArray(json)) continue;

      for (const item of json) {
        const src = typeof item?.source_url === "string" ? item.source_url : "";
        if (src) results.push(src);
      }
    } catch {
      // ignora
    }
  }

  return results;
}

async function findThumbnailCandidates(rawUrl) {
  const base = normalizeBaseUrl(rawUrl);
  const pages = uniq(
    DEFAULT_PAGES.map((p) => {
      if (!p) return base;
      return base.replace(/\/$/, "") + p;
    })
  );

  const collected = [];

  for (const pageUrl of pages) {
    try {
      const { text, contentType } = await fetchText(pageUrl, TIMEOUT_MS);
      if (!contentType.toLowerCase().includes("text/html")) continue;
      collected.push(...extractFromHtml(pageUrl, text));
    } catch {
      // ignora páginas bloqueadas / 404
    } finally {
      await sleep(DELAY_MS);
    }
  }

  collected.push(...(await tryWpJsonMedia(base)));

  const filtered = uniq(collected)
    .map((u) => u.trim())
    .filter(Boolean)
    .filter((u) => looksLikeImage(u))
    .filter((u) => !isLikelyGarbage(u));

  const ranked = filtered.sort((a, b) => scoreImage(b) - scoreImage(a)).slice(0, 60);

  return ranked;
}

function loadDb() {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

async function run() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Não encontrei: ${DB_PATH}`);
    process.exit(1);
  }

  const db = loadDb();
  const items = Array.isArray(db.items) ? db.items : [];

  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log(`✅ Backup: ${BACKUP_PATH}`);

  const baseQueue = items.filter((i) => !i.thumbnailUrl);
  const queue = MAX_ITEMS > 0 ? baseQueue.slice(0, MAX_ITEMS) : baseQueue;
  console.log(`Sem imagem: ${queue.length}`);

  const report = {
    processedAt: new Date().toISOString(),
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    batches: 0,
    samples: [],
    failures: [],
  };

  let offset = 0;
  while (offset < queue.length) {
    const batch = queue.slice(offset, offset + BATCH_SIZE);
    offset += BATCH_SIZE;
    report.batches += 1;

    let idx = 0;
    async function worker() {
      while (idx < batch.length) {
        const current = batch[idx++];
        const url = (current.url || "").trim();
        if (!url) {
          report.skipped += 1;
          continue;
        }

        try {
          const candidates = await findThumbnailCandidates(url);
          report.processed += 1;

          if (candidates.length) {
            current.thumbnailUrl = candidates[0];
            current.thumbnailSource = "deep";
            current.thumbnailTriedAt = new Date().toISOString();
            current.thumbnailAttempts = Number(current.thumbnailAttempts || 0) + 1;
            current.updatedAt = new Date().toISOString();

            report.updated += 1;
            if (report.samples.length < 20) {
              report.samples.push({
                name: current.name,
                url,
                thumbnailUrl: current.thumbnailUrl,
                source: "deep",
              });
            }
          } else {
            current.thumbnailTriedAt = new Date().toISOString();
            current.thumbnailAttempts = Number(current.thumbnailAttempts || 0) + 1;
            current.thumbnailSource = "none";
            report.skipped += 1;
          }
        } catch {
          report.failed += 1;
          report.failures.push({ name: current.name, url });
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    db.items = items;
    db.updatedAt = new Date().toISOString();
    saveDb(db);

    console.log(`Lote ${report.batches}: processados ${Math.min(offset, queue.length)}/${queue.length}`);
    if (offset < queue.length) {
      await sleep(PAUSE_BETWEEN_BATCHES_MS);
    }
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(`✅ Atualizado: ${DB_PATH}`);
  console.log(`📄 Report: ${REPORT_PATH}`);
  console.log(
    `Processed: ${report.processed} | Updated: ${report.updated} | Skipped: ${report.skipped} | Failed: ${report.failed}`
  );
}

run().catch((err) => {
  console.error("❌ enrich-thumbnails-deep falhou:", err);
  process.exit(1);
});
