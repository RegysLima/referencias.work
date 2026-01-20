import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "src", "data", "i18n");
const COUNTRIES_PATH = path.join(OUT_DIR, "countries.json");
const REPORT_PATH = path.join(ROOT, "public", "data", `i18n-countries-missing-${Date.now()}.json`);

async function fetchJson(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return await res.json();
}

function slugify(value) {
  return (value ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function clean(v) {
  return (v ?? "").toString().trim();
}

function readJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

function buildPtSlugToIso(ptMap) {
  const out = new Map();
  for (const [iso, name] of Object.entries(ptMap)) {
    const key = slugify(name);
    if (key && !out.has(key)) out.set(key, iso);
  }
  return out;
}

function normalizePtLabel(label) {
  const v = clean(label);
  if (!v) return "";
  const normalized = v
    .toLowerCase()
    .replace(/\b(da|de|do|das|dos)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

async function main() {
  if (!fs.existsSync(COUNTRIES_PATH)) {
    console.error(`Não encontrei: ${COUNTRIES_PATH}`);
    process.exit(1);
  }

  const countries = readJson(COUNTRIES_PATH, {});

  const baseUrl =
    "https://raw.githubusercontent.com/michaelwittig/node-i18n-iso-countries/master/langs";
  const [ptJson, enJson, esJson] = await Promise.all([
    fetchJson(`${baseUrl}/pt.json`),
    fetchJson(`${baseUrl}/en.json`),
    fetchJson(`${baseUrl}/es.json`),
  ]);

  const ptMap = ptJson?.countries || {};
  const enMap = enJson?.countries || {};
  const esMap = esJson?.countries || {};

  const ptSlugToIso = buildPtSlugToIso(ptMap);

  const missing = [];
  let filled = 0;

  for (const [key, entry] of Object.entries(countries)) {
    const ptLabel = entry?.pt || "";
    if (!ptLabel) continue;

    let iso = ptSlugToIso.get(slugify(ptLabel));
    if (!iso) {
      const alt = normalizePtLabel(ptLabel);
      const altKey = slugify(alt);
      iso = ptSlugToIso.get(altKey);
    }

    if (!iso) {
      missing.push({ key, pt: ptLabel });
      continue;
    }

    const enLabel = enMap[iso];
    const esLabel = esMap[iso];

    if (enLabel) entry.en = enLabel;
    if (esLabel) entry.es = esLabel;
    countries[key] = entry;
    filled += 1;
  }

  writeJson(COUNTRIES_PATH, countries);
  writeJson(REPORT_PATH, { missing, filled, total: Object.keys(countries).length });

  console.log(`✅ countries filled: ${filled}`);
  console.log(`📄 Missing report: ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error("❌ i18n-fill-countries falhou:", err);
  process.exit(1);
});
