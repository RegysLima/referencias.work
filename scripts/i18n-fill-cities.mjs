import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "src", "data", "i18n");
const CITIES_PATH = path.join(OUT_DIR, "cities.json");
const REPORT_PATH = path.join(ROOT, "public", "data", `i18n-cities-missing-${Date.now()}.json`);

function readJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const MAP = {
  "berlim": { en: "Berlin", es: "Berlín" },
  "munique": { en: "Munich", es: "Múnich" },
  "colonia": { en: "Cologne", es: "Colonia" },
  "lisboa": { en: "Lisbon", es: "Lisboa" },
  "porto": { en: "Porto", es: "Oporto" },
  "sao-paulo": { en: "São Paulo", es: "São Paulo" },
  "rio-de-janeiro": { en: "Rio de Janeiro", es: "Río de Janeiro" },
  "brasilia": { en: "Brasília", es: "Brasilia" },
  "nova-iorque": { en: "New York", es: "Nueva York" },
  "los-angeles": { en: "Los Angeles", es: "Los Ángeles" },
  "londres": { en: "London", es: "Londres" },
  "pequim": { en: "Beijing", es: "Pekín" },
  "xangai": { en: "Shanghai", es: "Shanghái" },
  "seul": { en: "Seoul", es: "Seúl" },
  "moscou": { en: "Moscow", es: "Moscú" },
  "munchen": { en: "Munich", es: "Múnich" },
  "genebra": { en: "Geneva", es: "Ginebra" },
  "haia": { en: "The Hague", es: "La Haya" },
  "florenca": { en: "Florence", es: "Florencia" },
  "veneza": { en: "Venice", es: "Venecia" },
  "milao": { en: "Milan", es: "Milán" },
  "roma": { en: "Rome", es: "Roma" },
  "barcelona": { en: "Barcelona", es: "Barcelona" },
  "madrid": { en: "Madrid", es: "Madrid" },
  "paris": { en: "Paris", es: "París" },
  "a-coruna": { en: "A Coruña", es: "A Coruña" },
  "la-coruna": { en: "A Coruña", es: "A Coruña" },
  "corunha": { en: "A Coruña", es: "A Coruña" },
  "santiago": { en: "Santiago", es: "Santiago" },
  "bogota": { en: "Bogotá", es: "Bogotá" },
  "mexico": { en: "Mexico City", es: "Ciudad de México" },
  "cidade-do-mexico": { en: "Mexico City", es: "Ciudad de México" },
  "cidade-de-mexico": { en: "Mexico City", es: "Ciudad de México" },
  "nova-york": { en: "New York", es: "Nueva York" },
  "nova-iorque": { en: "New York", es: "Nueva York" },
  "saint-petersburg": { en: "Saint Petersburg", es: "San Petersburgo" },
  "saint-petersburgo": { en: "Saint Petersburg", es: "San Petersburgo" }
};

const DO_NOT_TRANSLATE = new Set([
  "amsterdam",
  "barcelona",
  "madrid",
  "porto",
  "lisboa",
  "london",
  "los-angeles",
  "new-york",
  "paris"
]);

function main() {
  if (!fs.existsSync(CITIES_PATH)) {
    console.error(`Não encontrei: ${CITIES_PATH}`);
    process.exit(1);
  }

  const cities = readJson(CITIES_PATH, {});
  const missing = [];
  let filled = 0;

  for (const [key, entry] of Object.entries(cities)) {
    const slug = slugify(entry?.pt || "");
    if (DO_NOT_TRANSLATE.has(slug)) {
      if (!entry.en) entry.en = entry.pt;
      if (!entry.es) entry.es = entry.pt;
      cities[key] = entry;
      filled += 1;
      continue;
    }
    const mapKey = MAP[key] ? key : MAP[slug] ? slug : null;
    if (!mapKey) {
      if (!entry.en || !entry.es) missing.push({ key, pt: entry.pt, en: entry.en, es: entry.es });
      continue;
    }
    const t = MAP[mapKey];
    if (t?.en) entry.en = t.en;
    if (t?.es) entry.es = t.es;
    cities[key] = entry;
    filled += 1;
  }

  writeJson(CITIES_PATH, cities);
  writeJson(REPORT_PATH, { missing, filled, total: Object.keys(cities).length });

  console.log(`✅ cities filled: ${filled}`);
  console.log(`📄 Missing report: ${REPORT_PATH}`);
}

main();
