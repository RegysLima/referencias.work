import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "src", "data", "i18n");
const AREAS_PATH = path.join(OUT_DIR, "areas.json");
const REPORT_PATH = path.join(ROOT, "public", "data", `i18n-areas-missing-${Date.now()}.json`);

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
  "direcao-de-arte": { en: "Art direction", es: "Dirección de arte" },
  "design-grafico": { en: "Graphic design", es: "Diseño gráfico" },
  "design": { en: "Design", es: "Diseño" },
  "tipografia": { en: "Typography", es: "Tipografía" },
  "branding": { en: "Branding", es: "Branding" },
  "ilustracao": { en: "Illustration", es: "Ilustración" },
  "fotografia": { en: "Photography", es: "Fotografía" },
  "editorial": { en: "Editorial", es: "Editorial" },
  "identidade": { en: "Identity", es: "Identidad" },
  "identidade-visual": { en: "Visual identity", es: "Identidad visual" },
  "animacao": { en: "Animation", es: "Animación" },
  "3d": { en: "3D", es: "3D" },
  "2d": { en: "2D", es: "2D" },
  "direcao-criativa": { en: "Creative direction", es: "Dirección creativa" },
  "direcao-de-fotografia": { en: "Cinematography", es: "Dirección de fotografía" },
  "motion": { en: "Motion", es: "Motion" },
  "motion-design": { en: "Motion design", es: "Motion design" },
  "web-design": { en: "Web design", es: "Diseño web" },
  "ui": { en: "UI", es: "UI" },
  "ux": { en: "UX", es: "UX" },
  "produto": { en: "Product", es: "Producto" },
  "embalagem": { en: "Packaging", es: "Packaging" },
  "campanhas": { en: "Campaigns", es: "Campañas" },
  "arquitetura": { en: "Architecture", es: "Arquitectura" },
  "arte": { en: "Art", es: "Arte" },
  "artes-visuais": { en: "Visual arts", es: "Artes visuales" },
  "art-direction": { en: "Art direction", es: "Dirección de arte" },
  "design-de-superficie": { en: "Surface design", es: "Diseño de superficie" },
  "design-de-produto": { en: "Product design", es: "Diseño de producto" },
  "interface": { en: "Interface", es: "Interfaz" },
  "ilustracao-editorial": { en: "Editorial illustration", es: "Ilustración editorial" },
  "ilustracao-infantil": { en: "Children's illustration", es: "Ilustración infantil" },
  "lettering": { en: "Lettering", es: "Lettering" },
  "caligrafia": { en: "Calligraphy", es: "Caligrafía" },
  "infografia": { en: "Infographics", es: "Infografía" },
  "direcao-de-arte-editorial": { en: "Editorial art direction", es: "Dirección de arte editorial" },
  "fotografia-de-moda": { en: "Fashion photography", es: "Fotografía de moda" },
  "fotografia-de-produto": { en: "Product photography", es: "Fotografía de producto" },
  "aquarela": { en: "Watercolor", es: "Acuarela" },
  "cenografia": { en: "Scenography", es: "Escenografía" },
  "autoral": { en: "Authorial", es: "Original" }
};

// apply direct values for common variants
const EXTRA = {
  "direcao de arte": { en: "Art direction", es: "Dirección de arte" },
  "design grafico": { en: "Graphic design", es: "Diseño gráfico" },
  "art direction": { en: "Art direction", es: "Dirección de arte" }
};

const DO_NOT_TRANSLATE = new Set([
  "branding",
  "ux",
  "ui",
  "3d",
  "2d",
  "motion"
]);

function main() {
  if (!fs.existsSync(AREAS_PATH)) {
    console.error(`Não encontrei: ${AREAS_PATH}`);
    process.exit(1);
  }

  const areas = readJson(AREAS_PATH, {});
  const missing = [];
  let filled = 0;

  for (const [key, entry] of Object.entries(areas)) {
    const ptLabel = entry?.pt || "";
    if (DO_NOT_TRANSLATE.has(ptLabel.toLowerCase())) {
      if (!entry.en) entry.en = ptLabel;
      if (!entry.es) entry.es = ptLabel;
      areas[key] = entry;
      filled += 1;
      continue;
    }
    const slug = slugify(ptLabel);
    const mapKey = MAP[key] ? key : MAP[slug] ? slug : null;
    const extraKey = EXTRA[ptLabel.toLowerCase()] ? ptLabel.toLowerCase() : null;
    if (!mapKey) {
      if (extraKey) {
        const t = EXTRA[extraKey];
        if (t?.en) entry.en = t.en;
        if (t?.es) entry.es = t.es;
        areas[key] = entry;
        filled += 1;
        continue;
      }
      if (!entry.en || !entry.es) missing.push({ key, pt: entry.pt, en: entry.en, es: entry.es });
      continue;
    }
    const t = MAP[mapKey];
    if (t?.en) entry.en = t.en;
    if (t?.es) entry.es = t.es;
    areas[key] = entry;
    filled += 1;
  }

  writeJson(AREAS_PATH, areas);
  writeJson(REPORT_PATH, { missing, filled, total: Object.keys(areas).length });

  console.log(`✅ areas filled: ${filled}`);
  console.log(`📄 Missing report: ${REPORT_PATH}`);
}

main();
