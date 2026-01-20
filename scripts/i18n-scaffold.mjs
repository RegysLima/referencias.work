import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "public", "data", "references.json");
const OUT_DIR = path.join(ROOT, "src", "data", "i18n");
const REPORT_PATH = path.join(ROOT, "public", "data", `i18n-missing-${Date.now()}.json`);

function clean(v) {
  return (v ?? "").toString().trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

function mergeMap(existing, entries) {
  const out = { ...existing };
  for (const { key, label } of entries) {
    if (!key) continue;
    if (!out[key]) out[key] = { pt: label, en: "", es: "" };
    if (!out[key].pt) out[key].pt = label;
  }
  return out;
}

function normalizeKey(label) {
  const v = clean(label);
  if (!v) return "";
  return slugify(v);
}

function collect(items, getter) {
  const list = [];
  for (const it of items) {
    const raw = getter(it);
    if (!raw) continue;
    const key = normalizeKey(raw);
    if (!key) continue;
    list.push({ key, label: raw });
  }
  return list;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Não encontrei: ${DB_PATH}`);
    process.exit(1);
  }

  const db = readJson(DB_PATH, { items: [] });
  const items = Array.isArray(db.items) ? db.items : [];

  const areasList = [];
  for (const it of items) {
    if (it.areaPrimary) areasList.push({ key: normalizeKey(it.areaPrimary), label: it.areaPrimary });
    if (Array.isArray(it.areasSecondary)) {
      for (const a of it.areasSecondary) {
        if (!a) continue;
        areasList.push({ key: normalizeKey(a), label: a });
      }
    }
  }

  const countriesList = collect(items, (it) => it.country);
  const citiesList = collect(items, (it) => it.city);

  const areasPath = path.join(OUT_DIR, "areas.json");
  const countriesPath = path.join(OUT_DIR, "countries.json");
  const citiesPath = path.join(OUT_DIR, "cities.json");

  const areas = mergeMap(readJson(areasPath, {}), areasList);
  const countries = mergeMap(readJson(countriesPath, {}), countriesList);
  const cities = mergeMap(readJson(citiesPath, {}), citiesList);

  function sortMap(map) {
    return Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
  }

  writeJson(areasPath, sortMap(areas));
  writeJson(countriesPath, sortMap(countries));
  writeJson(citiesPath, sortMap(cities));

  const missing = {
    areas: Object.entries(areas)
      .filter(([, v]) => !v.en || !v.es)
      .map(([k, v]) => ({ key: k, pt: v.pt, en: v.en, es: v.es })),
    countries: Object.entries(countries)
      .filter(([, v]) => !v.en || !v.es)
      .map(([k, v]) => ({ key: k, pt: v.pt, en: v.en, es: v.es })),
    cities: Object.entries(cities)
      .filter(([, v]) => !v.en || !v.es)
      .map(([k, v]) => ({ key: k, pt: v.pt, en: v.en, es: v.es })),
  };

  writeJson(REPORT_PATH, missing);

  console.log(`✅ i18n scaffold: ${areasList.length} áreas, ${countriesList.length} países, ${citiesList.length} cidades`);
  console.log(`📄 Missing report: ${REPORT_PATH}`);
}

main();
