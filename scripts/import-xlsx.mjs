import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const input = path.join(process.cwd(), "data", "referencias.work-finaldatabase.xlsx");
const output = path.join(process.cwd(), "public", "data", "references.json");

const rulesPath = path.join(process.cwd(), "data", "normalize.rules.json");
const RULES = fs.existsSync(rulesPath)
  ? JSON.parse(fs.readFileSync(rulesPath, "utf-8"))
  : { typeMap: {}, areaMap: {}, tagMap: {}, countryMap: {}, cityMap: {} };

const TYPE_MAP = RULES.typeMap ?? {};
const AREA_MAP = RULES.areaMap ?? {};
const TAG_MAP = RULES.tagMap ?? {};
const COUNTRY_MAP = RULES.countryMap ?? {};
const CITY_MAP = RULES.cityMap ?? {};
const MACRO_TYPE_MAP = RULES.macroTypeMap ?? {};

function clean(v) {
  return (v ?? "").toString().trim();
}

function normalizeType(raw) {
  const t = clean(raw);
  if (!t) return "Studio";
  return TYPE_MAP[t] ?? t;
}

function macroTypeFrom(typeCanon) {
  const t = clean(typeCanon);
  return MACRO_TYPE_MAP[t] ?? "Studios";
}

function normalizeArea(raw) {
  const a = clean(raw);
  if (!a) return "";
  return AREA_MAP[a] ?? a;
}

function normalizeCountry(raw) {
  const c = clean(raw);
  if (!c) return "";
  return COUNTRY_MAP[c] ?? c;
}

function normalizeCity(raw) {
  const c = clean(raw);
  if (!c) return "";
  return CITY_MAP[c] ?? c;
}

function splitTags(raw) {
  const s = clean(raw);
  if (!s) return [];
  const parts = s.split(/[;,|/]/g).map(p => p.trim()).filter(Boolean);
  const normalized = parts.map(p => TAG_MAP[p] ?? p);

  const seen = new Set();
  return normalized.filter(t => (seen.has(t) ? false : (seen.add(t), true)));
}

function normalizeUrl(raw) {
  const u = clean(raw);
  if (!u) return "";
  try {
    const url = new URL(u);
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

function slugify(s) {
  return clean(s)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function uniq(arr) {
  const seen = new Set();
  return arr.filter(x => (seen.has(x) ? false : (seen.add(x), true)));
}

if (!fs.existsSync(input)) {
  console.error(`Arquivo não encontrado: ${input}`);
  process.exit(1);
}

const wb = xlsx.readFile(input);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

const out = [];
const urlSeen = new Set();

for (const r of rows) {
  const name = clean(r["Nome"]);
  const url = normalizeUrl(r["URL"]);
  if (!name || !url) continue;

  // evita duplicatas por URL
  if (urlSeen.has(url)) continue;
  urlSeen.add(url);

  const type = normalizeType(r["Tipo"]);
  const macroType = macroTypeFrom(type);
  const areaPrimary = normalizeArea(r["Área principal"]);
  const areasSecondary = splitTags(r["Áreas secundárias"]);
  const country = normalizeCountry(r["País"]);
  const city = normalizeCity(r["Cidade"]);

  // tags finais: areaPrimary + secundárias (sem repetição)
  const tags = uniq([areaPrimary, ...areasSecondary].filter(Boolean));

  out.push({
    id: slugify(`${name}-${url}`),
    name,
    url,
    type,
    macroType,
    areaPrimary: areaPrimary || null,
    areasSecondary,
    tags,
    country: country || null,
    city: city || null,
    thumbnailUrl: null,
    updatedAt: new Date().toISOString()
    });

}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ count: out.length, items: out }, null, 2), "utf-8");

console.log(`✅ Gerado ${output}`);
console.log(`Itens: ${out.length}`);
console.log(`Regras carregadas: ${fs.existsSync(rulesPath) ? "sim" : "não"} (${rulesPath})`);