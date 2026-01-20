import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "public", "data", "references.json");
const BACKUP_PATH = path.join(ROOT, "public", "data", `references.backup.normalize.${Date.now()}.json`);

const rulesPath = path.join(ROOT, "data", "normalize.rules.json");
const RULES = fs.existsSync(rulesPath)
  ? JSON.parse(fs.readFileSync(rulesPath, "utf-8"))
  : { typeMap: {}, areaMap: {}, tagMap: {}, countryMap: {}, cityMap: {}, macroTypeMap: {} };

const TYPE_MAP = RULES.typeMap ?? {};
const AREA_MAP = { ...(RULES.areaMap ?? {}), ...(RULES.tagMap ?? {}) };
const COUNTRY_MAP = RULES.countryMap ?? {};
const CITY_MAP = RULES.cityMap ?? {};
const MACRO_MAP = RULES.macroTypeMap ?? {};

const MACRO_CANON = new Set(["Studios", "Designers", "Photographers", "Illustrators", "Foundries"]);

function clean(v) {
  return (v ?? "").toString().trim();
}

function normalizeSpaces(s) {
  return clean(s).replace(/\s+/g, " ");
}

function capWord(word, isFirst) {
  if (!word) return word;
  if (/[0-9]/.test(word)) return word;
  if (word.toUpperCase() === word && word.length <= 4) return word;
  const lower = word.toLowerCase();
  const lowercaseWords = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "por"]);
  if (!isFirst && lowercaseWords.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function titleCase(s) {
  return normalizeSpaces(s)
    .split(" ")
    .map((token, idx) =>
      token
        .split("-")
        .map((part, partIdx) => capWord(part, idx === 0 && partIdx === 0))
        .join("-")
    )
    .join(" ");
}

function normalizeMacro(raw) {
  const v = normalizeSpaces(raw);
  if (!v) return "";
  const mapped = MACRO_MAP[v] ?? v;
  if (MACRO_CANON.has(mapped)) return mapped;
  const low = mapped.toLowerCase();
  if (low === "studio") return "Studios";
  if (low === "designer") return "Designers";
  if (low === "photographer" || low.includes("foto")) return "Photographers";
  if (low === "illustrator" || low.includes("ilustr")) return "Illustrators";
  if (low === "foundry") return "Foundries";
  return mapped;
}

function normalizeType(raw) {
  const v = normalizeSpaces(raw);
  if (!v) return "";
  return TYPE_MAP[v] ?? v;
}

function normalizeArea(raw) {
  const v = normalizeSpaces(raw);
  if (!v) return "";
  const low = v.toLowerCase();
  if (low === "2d") return "2D";
  if (low === "3d") return "3D";
  const mapped = AREA_MAP[v] ?? v;
  return titleCase(mapped);
}

function normalizeCountry(raw) {
  const v = normalizeSpaces(raw);
  if (!v) return "";
  const mapped = COUNTRY_MAP[v] ?? v;
  return titleCase(mapped);
}

function normalizeCity(raw) {
  const v = normalizeSpaces(raw);
  if (!v) return "";
  const mapped = CITY_MAP[v] ?? v;
  return titleCase(mapped);
}

function splitSecondary(raw) {
  if (Array.isArray(raw)) return raw.map(clean).filter(Boolean);
  return clean(raw)
    .split(/[;,|/]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniqList(list) {
  const seen = new Set();
  const out = [];
  for (const v of list) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function normalizeSecondaryAreas(primary, secondary) {
  const p = clean(primary).toLowerCase();
  const arr = splitSecondary(secondary)
    .map((s) => normalizeArea(s))
    .filter(Boolean)
    .filter((s) => (p ? s.toLowerCase() !== p : true));

  return uniqList(arr).slice(0, 4);
}

function normalizeTags(primary, secondary) {
  return uniqList([primary, ...secondary].filter(Boolean));
}

function loadDb() {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Não encontrei: ${DB_PATH}`);
    process.exit(1);
  }

  const db = loadDb();
  const items = Array.isArray(db.items) ? db.items : [];
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log(`✅ Backup: ${BACKUP_PATH}`);

  let changed = 0;

  for (const it of items) {
    const before = JSON.stringify({
      type: it.type,
      macroType: it.macroType,
      areaPrimary: it.areaPrimary,
      areasSecondary: it.areasSecondary,
      tags: it.tags,
      country: it.country,
      city: it.city,
    });

    const type = normalizeType(it.type);
    const macroType = normalizeMacro(it.macroType || it.macro || type);
    const areaPrimary = normalizeArea(it.areaPrimary);
    const areasSecondary = normalizeSecondaryAreas(areaPrimary, it.areasSecondary);
    const tags = normalizeTags(areaPrimary, areasSecondary);
    const country = normalizeCountry(it.country);
    const city = normalizeCity(it.city);

    it.type = type || it.type;
    it.macroType = macroType || it.macroType;
    it.areaPrimary = areaPrimary || null;
    it.areasSecondary = areasSecondary;
    it.tags = tags;
    it.country = country || null;
    it.city = city || null;

    const after = JSON.stringify({
      type: it.type,
      macroType: it.macroType,
      areaPrimary: it.areaPrimary,
      areasSecondary: it.areasSecondary,
      tags: it.tags,
      country: it.country,
      city: it.city,
    });

    if (before !== after) changed++;
  }

  db.items = items;
  db.count = items.length;
  db.updatedAt = new Date().toISOString();
  saveDb(db);

  console.log(`✅ normalize-references: ${changed} itens ajustados (de ${items.length}).`);
}

main();
