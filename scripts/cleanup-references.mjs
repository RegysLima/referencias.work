import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, "public", "data", "references.json");

function canon(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
}

function normMacroCategory(cat) {
  const c = canon(cat);
  if (!c) return cat;

  // normaliza variações comuns
  if (["studio", "studios"].includes(c)) return "Studios";
  if (["photographer", "photographers", "fotografo", "fotógrafo", "fotografos", "fotógrafos"].includes(c))
    return "Photographers";
  if (["illustrator", "illustrators", "ilustrador", "ilustradores"].includes(c)) return "Illustrators";
  if (["foundry", "foundries", "type foundry", "type foundries"].includes(c)) return "Foundries";
  if (["designer", "designers"].includes(c)) return "Designers";

  // fallback: mantém como estava
  return cat;
}

function normalizeSecondaryAreas(primary, secondary) {
  const primaryC = canon(primary);

  // secondary pode vir array ou string
  const arr = Array.isArray(secondary)
    ? secondary
    : String(secondary || "").split(",");

  const cleaned = [];
  const seen = new Set();

  for (const raw of arr) {
    const item = String(raw || "").trim();
    if (!item) continue;

    const c = canon(item);
    if (!c) continue;

    // remove se for igual à área principal (mesmo com acento/caixa diferente)
    if (primaryC && c === primaryC) continue;

    if (seen.has(c)) continue;
    seen.add(c);

    cleaned.push(item);
    if (cleaned.length >= 4) break; // limite
  }

  return cleaned;
}

async function main() {
  const raw = await fs.readFile(JSON_PATH, "utf8");
  const data = JSON.parse(raw);

  const items = Array.isArray(data.items) ? data.items : [];
  let changed = 0;

  for (const it of items) {
    const before = JSON.stringify({
      macroCategory: it.macroCategory,
      primaryArea: it.primaryArea,
      secondaryAreas: it.secondaryAreas,
    });

    it.macroCategory = normMacroCategory(it.macroCategory);

    const primaryArea = it.primaryArea || "";
    it.secondaryAreas = normalizeSecondaryAreas(primaryArea, it.secondaryAreas);

    const after = JSON.stringify({
      macroCategory: it.macroCategory,
      primaryArea: it.primaryArea,
      secondaryAreas: it.secondaryAreas,
    });

    if (before !== after) changed++;
  }

  data.items = items;

  await fs.writeFile(JSON_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");

  console.log(`✅ cleanup-references: ${changed} itens ajustados (de ${items.length}).`);
}

main().catch((err) => {
  console.error("❌ cleanup-references falhou:", err);
  process.exit(1);
});
