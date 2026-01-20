import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "public", "data", "references.json");
const AREAS_PATH = path.join(ROOT, "src", "data", "i18n", "areas.json");
const BACKUP_PATH = path.join(ROOT, "public", "data", `references.backup.area-fix.${Date.now()}.json`);

const TARGET = {
  lifestyle: "Lifestyle",
  "fine-art": "Fine Art",
  portraits: "Portraits",
  print: "Print",
  product: "Product",
  texture: "Texture",
  retrato: "Retrato",
  produto: "Produto",
  textura: "Textura",
  esportes: "Esportes",
  estampa: "Estampa",
  embalagem: "Embalagem",
  botanica: "Botânica",
  colorido: "Colorido",
  psicodelica: "Psicodélica",
  urbana: "Urbana"
};

const ALIASES = {
  lifetyle: "Lifestyle",
  "fine-arts": "Fine Art",
  portrait: "Portraits",
  prints: "Print",
  products: "Product",
  textures: "Texture",
  retratos: "Retrato",
  produtos: "Produto",
  texturas: "Textura",
  esporte: "Esportes",
  estampas: "Estampa",
  embalagens: "Embalagem",
  botanico: "Botânica",
  colorida: "Colorido",
  criativa: "Colorido",
  criativo: "Colorido",
  psicodelico: "Psicodélica",
  urbano: "Urbana"
};

function clean(v) {
  return (v ?? "").toString().trim();
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeLabel(label) {
  const key = slugify(label);
  if (ALIASES[key]) return ALIASES[key];
  if (TARGET[key]) return TARGET[key];
  return label;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Não encontrei: ${DB_PATH}`);
    process.exit(1);
  }

  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log(`✅ Backup: ${BACKUP_PATH}`);

  const db = loadJson(DB_PATH);
  const items = Array.isArray(db.items) ? db.items : [];
  let changed = 0;

  for (const it of items) {
    const before = JSON.stringify({
      areaPrimary: it.areaPrimary,
      areasSecondary: it.areasSecondary
    });

    if (it.areaPrimary) {
      it.areaPrimary = normalizeLabel(it.areaPrimary);
    }

    if (Array.isArray(it.areasSecondary)) {
      it.areasSecondary = it.areasSecondary.map(normalizeLabel);
    }

    const after = JSON.stringify({
      areaPrimary: it.areaPrimary,
      areasSecondary: it.areasSecondary
    });

    if (before !== after) {
      it.updatedAt = new Date().toISOString();
      changed += 1;
    }
  }

  db.items = items;
  db.updatedAt = new Date().toISOString();
  saveJson(DB_PATH, db);

  if (fs.existsSync(AREAS_PATH)) {
    const areas = loadJson(AREAS_PATH);
    for (const [key, entry] of Object.entries(areas)) {
      if (!entry || !entry.pt) continue;
      const normalized = normalizeLabel(entry.pt);
      if (normalized !== entry.pt) {
        entry.pt = normalized;
        if (entry.en && slugify(entry.en) === slugify(entry.pt)) {
          entry.en = normalized;
        }
        if (entry.es && slugify(entry.es) === slugify(entry.pt)) {
          entry.es = normalized;
        }
        areas[key] = entry;
      }
    }
    saveJson(AREAS_PATH, areas);
  }

  console.log(`✅ padronização aplicada em ${changed} referências`);
}

main();
