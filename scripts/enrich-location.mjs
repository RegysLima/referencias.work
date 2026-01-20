import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "public", "data", "references.json");
const BACKUP_PATH = path.join(process.cwd(), "public", "data", `references.backup.location.${Date.now()}.json`);
const REPORT_PATH = path.join(process.cwd(), "public", "data", `location-report-${Date.now()}.json`);

const CONCURRENCY = 3;
const DELAY_MS = 350;
const TIMEOUT_MS = 8000;
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 0);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 80);
const PAUSE_BETWEEN_BATCHES_MS = Number(process.env.PAUSE_BETWEEN_BATCHES_MS || 800);

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

function getOriginAndPath(input) {
  const u = new URL(input);
  const origin = `${u.protocol}//${u.host}`;
  const pathOnly = u.pathname.replace(/\/+$/, "") || "/";
  return { origin, path: pathOnly };
}

async function fetchHtml(url, timeoutMs = TIMEOUT_MS) {
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
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8,es;q=0.7",
      },
    });

    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("text/html")) throw new Error("NOT_HTML");
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function extractJsonLdAddress(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  function isRecord(v) {
    return typeof v === "object" && v !== null;
  }

  let m;
  while ((m = re.exec(html))) {
    const chunk = m[1] || "";
    try {
      const parsed = JSON.parse(chunk);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      const objects = [];

      while (queue.length) {
        const obj = queue.shift();
        if (!isRecord(obj)) continue;
        objects.push(obj);
        const graph = obj["@graph"];
        if (Array.isArray(graph)) queue.push(...graph);
      }

      for (const obj of objects) {
        const addrCandidates = [];
        const addressVal = obj["address"];
        if (addressVal) addrCandidates.push(addressVal);

        const locationVal = obj["location"];
        if (isRecord(locationVal) && locationVal["address"]) {
          addrCandidates.push(locationVal["address"]);
        }
        if (Array.isArray(locationVal)) {
          for (const loc of locationVal) {
            if (isRecord(loc) && loc["address"]) addrCandidates.push(loc["address"]);
          }
        }

        const flatCandidates = addrCandidates.flatMap((v) => (Array.isArray(v) ? v : [v]));
        for (const addr of flatCandidates) {
          if (!isRecord(addr)) continue;

          const city =
            typeof addr["addressLocality"] === "string"
              ? addr["addressLocality"]
              : typeof addr["addressRegion"] === "string"
              ? addr["addressRegion"]
              : undefined;

          const addrCountry = addr["addressCountry"];
          const country =
            typeof addrCountry === "string"
              ? addrCountry
              : isRecord(addrCountry) && typeof addrCountry["name"] === "string"
              ? addrCountry["name"]
              : undefined;

          if (city || country) return { city, country };
        }
      }
    } catch {
      // ignora JSON inválido
    }
  }

  return {};
}

function extractByRegex(html) {
  const keywords = [
    "contact",
    "contato",
    "address",
    "endereço",
    "endereco",
    "location",
    "studio",
    "office",
    "impressum",
    "about",
    "sobre",
  ];

  function stripToLines(raw) {
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|section|address|footer|header|article|main|span|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " ")
      .split(/\n+/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function isNoise(s) {
    const v = s.toLowerCase();
    return v.includes("@") || v.includes("http") || v.includes("www") || /\d{3,}/.test(v);
  }

  function clean(s) {
    const v = (s || "").trim();
    return v || undefined;
  }

  function extractCityCountryFromText(text) {
    const re =
      /([A-ZÁÉÍÓÚÂÊÔÃÕÄËÏÖÜ][A-Za-zÀ-ÿ.'-]{1,40}(?:\s+[A-Za-zÀ-ÿ.'-]{1,40}){0,3})\s*(?:,|–|-|•)\s*([A-ZÁÉÍÓÚÂÊÔÃÕÄËÏÖÜ][A-Za-zÀ-ÿ.'-]{1,40}(?:\s+[A-Za-zÀ-ÿ.'-]{1,40}){0,3})/;
    const m = text.match(re);
    if (!m) return null;
    if (isNoise(m[1]) || isNoise(m[2])) return null;
    return { city: clean(m[1]), country: clean(m[2]) };
  }

  function extractCityStateCountry(text) {
    const re =
      /([A-ZÁÉÍÓÚÂÊÔÃÕÄËÏÖÜ][A-Za-zÀ-ÿ.'-]{1,40}(?:\s+[A-Za-zÀ-ÿ.'-]{1,40}){0,3})\s+([A-Z]{2,3})\s+\d{3,5}/;
    const m = text.match(re);
    if (!m) return null;
    if (isNoise(m[1])) return null;

    const state = m[2].toUpperCase();
    const usStates = new Set([
      "AL",
      "AK",
      "AZ",
      "AR",
      "CA",
      "CO",
      "CT",
      "DE",
      "FL",
      "GA",
      "HI",
      "ID",
      "IL",
      "IN",
      "IA",
      "KS",
      "KY",
      "LA",
      "ME",
      "MD",
      "MA",
      "MI",
      "MN",
      "MS",
      "MO",
      "MT",
      "NE",
      "NV",
      "NH",
      "NJ",
      "NM",
      "NY",
      "NC",
      "ND",
      "OH",
      "OK",
      "OR",
      "PA",
      "RI",
      "SC",
      "SD",
      "TN",
      "TX",
      "UT",
      "VT",
      "VA",
      "WA",
      "WV",
      "WI",
      "WY",
      "DC",
    ]);
    const auStates = new Set(["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);
    const caProvinces = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);

    if (usStates.has(state)) return { city: clean(m[1]), country: "Estados Unidos" };
    if (auStates.has(state)) return { city: clean(m[1]), country: "Austrália" };
    if (caProvinces.has(state)) return { city: clean(m[1]), country: "Canadá" };

    return { city: clean(m[1]) };
  }

  function extractCityFromAddressLine(text) {
    const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const last = parts[parts.length - 1];
    if (isNoise(last)) return null;
    const hasAddressCue =
      /\d{2,}/.test(text) || /(rua|street|st\.|avenida|av\.|strasse|straße|calle|via|road|rd\.)/i.test(text);
    if (!hasAddressCue) return null;
    if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÄËÏÖÜ]/.test(last)) return null;
    return { city: clean(last) };
  }

  const addressBlocks = [];
  const addressRe = /<address[^>]*>([\s\S]*?)<\/address>/gi;
  let addrMatch;
  while ((addrMatch = addressRe.exec(html))) {
    addressBlocks.push(stripToLines(addrMatch[1]).join(" "));
  }

  for (const block of addressBlocks) {
    const hit = extractCityCountryFromText(block);
    if (hit) return hit;
    const stateHit = extractCityStateCountry(block);
    if (stateHit) return stateHit;
    const cityOnly = extractCityFromAddressLine(block);
    if (cityOnly) return cityOnly;
  }

  function tryLines(lines) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLow = line.toLowerCase();
      if (!keywords.some((k) => lineLow.includes(k))) continue;

      const combo = [line, lines[i + 1] || "", lines[i + 2] || ""].join(" ");
      const hit = extractCityCountryFromText(combo);
      if (hit) return hit;

      const stateHit = extractCityStateCountry(combo);
      if (stateHit) return stateHit;

      const cityOnly = extractCityFromAddressLine(combo);
      if (cityOnly) return cityOnly;
    }
    return null;
  }

  const contactIdx = html.toLowerCase().indexOf('id="contact"');
  if (contactIdx >= 0) {
    const slice = html.slice(Math.max(0, contactIdx - 1500), contactIdx + 4000);
    const hit = tryLines(stripToLines(slice));
    if (hit) return hit;
  }

  const lines = stripToLines(html);
  const hit = tryLines(lines);
  if (hit) return hit;

  return {};
}

async function suggestLocation(rawUrl) {
  const base = normalizeBaseUrl(rawUrl);
  const { origin, path: basePath } = getOriginAndPath(rawUrl);
  const root = origin;
  const basePage = basePath === "/" ? origin : `${origin}${basePath}`;

  const pages = [
    base,
    root,
    basePage,
    `${root}/contact`,
    `${root}/contato`,
    `${root}/about`,
    `${root}/sobre`,
    `${root}/impressum`,
    `${root}/studio`,
    `${root}/work`,
  ];

  for (const p of pages) {
    try {
      const html = await fetchHtml(p, TIMEOUT_MS);
      const fromLd = extractJsonLdAddress(html);
      if (fromLd.city || fromLd.country) {
        return { city: fromLd.city, country: fromLd.country, source: p, method: "jsonld" };
      }
      const fromRegex = extractByRegex(html);
      if (fromRegex.city || fromRegex.country) {
        return { city: fromRegex.city, country: fromRegex.country, source: p, method: "regex" };
      }
    } catch {
      // ignora página
    } finally {
      await sleep(DELAY_MS);
    }
  }

  return { city: null, country: null, source: null, method: null };
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

  const baseQueue = items.filter((i) => !i.reviewedAt);
  const queue = MAX_ITEMS > 0 ? baseQueue.slice(0, MAX_ITEMS) : baseQueue;
  console.log(`Itens sem revisão: ${queue.length}`);

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
          const result = await suggestLocation(url);
          report.processed += 1;

          const nextCity = result.city || "";
          const nextCountry = result.country || "";

          if (nextCity || nextCountry) {
            let changed = false;
            if (nextCity && current.city !== nextCity) {
              current.city = nextCity;
              changed = true;
            }
            if (nextCountry && current.country !== nextCountry) {
              current.country = nextCountry;
              changed = true;
            }

            if (changed) {
              current.updatedAt = new Date().toISOString();
              report.updated += 1;
              if (report.samples.length < 20) {
                report.samples.push({
                  name: current.name,
                  url,
                  city: current.city,
                  country: current.country,
                  source: result.source,
                  method: result.method,
                });
              }
            } else {
              report.skipped += 1;
            }
          } else {
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
  console.error("❌ enrich-location falhou:", err);
  process.exit(1);
});
