import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "src", "data", "i18n");
const AREAS_PATH = path.join(OUT_DIR, "areas.json");
const CITIES_PATH = path.join(OUT_DIR, "cities.json");
const REPORT_PATH = path.join(ROOT, "public", "data", `i18n-translate-report-${Date.now()}.json`);

const PROVIDER = process.env.TRANSLATE_PROVIDER || "mymemory";
const PROVIDER_URL =
  process.env.TRANSLATE_URL || (PROVIDER === "libretranslate" ? "https://libretranslate.com/translate" : "");
const API_KEY = process.env.TRANSLATE_KEY || "";
const SOURCE = "pt";
const TARGETS = (process.env.TARGETS || "en,es").split(",").map((s) => s.trim()).filter(Boolean);
const TYPES = (process.env.TYPES || "areas,cities").split(",").map((s) => s.trim()).filter(Boolean);
const DELAY_MS = Number(process.env.DELAY_MS || 350);
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 0);

const DO_NOT_TRANSLATE = new Set(["branding", "ux", "ui", "3d", "2d", "motion"]);
const SKIP_EXACT = new Set(["n/a", "-", ""]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

async function translateText(text, target) {
  if (PROVIDER === "mymemory") {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", `${SOURCE}|${target}`);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const data = await res.json();
    return data?.responseData?.translatedText || "";
  }

  const payload = {
    q: text,
    source: SOURCE,
    target,
    format: "text",
  };
  if (API_KEY) payload.api_key = API_KEY;

  const res = await fetch(PROVIDER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = await res.json();
  return data.translatedText || "";
}

function shouldSkipLabel(label) {
  const v = (label || "").trim();
  const lower = v.toLowerCase();
  if (SKIP_EXACT.has(lower)) return true;
  if (DO_NOT_TRANSLATE.has(lower)) return true;
  if (v.includes("(") || v.includes(")")) return true;
  return false;
}

async function fillMap(map, type, report) {
  let items = Object.entries(map).filter(([, v]) => v && v.pt && (!v.en || !v.es));
  if (MAX_ITEMS > 0) items = items.slice(0, MAX_ITEMS);

  for (const [key, entry] of items) {
    const pt = (entry.pt || "").trim();
    if (shouldSkipLabel(pt)) {
      report.skipped.push({ type, key, pt, reason: "skip-rule" });
      continue;
    }

    for (const target of TARGETS) {
      if (entry[target]) continue;
      try {
        const translated = await translateText(pt, target);
        if (!translated) {
          report.skipped.push({ type, key, pt, target, reason: "empty-translation" });
          continue;
        }
        entry[target] = translated;
        report.translated += 1;
      } catch {
        report.skipped.push({ type, key, pt, target, reason: "error" });
      }
      await sleep(DELAY_MS);
    }
    map[key] = entry;
  }
}

async function main() {
  const report = { translated: 0, skipped: [] };

  if (TYPES.includes("areas")) {
    const areas = readJson(AREAS_PATH, {});
    await fillMap(areas, "areas", report);
    writeJson(AREAS_PATH, areas);
  }

  if (TYPES.includes("cities")) {
    const cities = readJson(CITIES_PATH, {});
    await fillMap(cities, "cities", report);
    writeJson(CITIES_PATH, cities);
  }

  writeJson(REPORT_PATH, report);
  console.log(`✅ translated: ${report.translated}`);
  console.log(`📄 Report: ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error("❌ i18n-translate-missing falhou:", err);
  process.exit(1);
});
