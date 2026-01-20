import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "src", "data", "i18n");
const FILES = ["areas.json", "countries.json", "cities.json"];

const KEEP_UPPER = new Set(["3D", "2D", "UI", "UX", "N/A", "USA", "UK"]);

const LOWERCASE_WORDS = {
  en: new Set(["of", "and", "the", "for", "in", "on", "at", "to", "from"]),
  es: new Set(["de", "del", "la", "el", "y", "en", "a", "para", "por"]),
};

function readJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

function isAllCaps(s) {
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÜÑÇÃÕÂÊÔÀÈÌÒÙÄËÏÖÜ]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function capWord(word, lang, isFirst) {
  if (!word) return word;
  if (KEEP_UPPER.has(word)) return word;
  const lower = word.toLowerCase();
  if (!isFirst && LOWERCASE_WORDS[lang]?.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function titleCase(input, lang) {
  return input
    .split(" ")
    .map((token, idx) =>
      token
        .split("-")
        .map((part, partIdx) => capWord(part, lang, idx === 0 && partIdx === 0))
        .join("-")
    )
    .join(" ");
}

function normalizeLabel(lang, value) {
  const v = (value ?? "").toString().trim();
  if (!v) return v;
  if (KEEP_UPPER.has(v)) return v;
  if (!isAllCaps(v)) return v;
  return titleCase(v, lang);
}

function main() {
  for (const file of FILES) {
    const p = path.join(OUT_DIR, file);
    const data = readJson(p, {});
    let changed = 0;

    for (const entry of Object.values(data)) {
      if (!entry) continue;
      for (const lang of ["en", "es"]) {
        if (!entry[lang]) continue;
        const next = normalizeLabel(lang, entry[lang]);
        if (next !== entry[lang]) {
          entry[lang] = next;
          changed += 1;
        }
      }
    }

    writeJson(p, data);
    console.log(`✅ ${file}: ${changed} labels normalizados`);
  }
}

main();
