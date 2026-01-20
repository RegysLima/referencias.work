import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "public", "data", "references.json");
const BACKUP_PATH = path.join(ROOT, "public", "data", `references.backup.location-flags.${Date.now()}.json`);
const REPORT_PATH = path.join(ROOT, "public", "data", `location-flags-${Date.now()}.json`);

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

function loadDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

const COUNTRY_FIXES = new Map([
  ["alemananha", "Alemanha"],
  ["alemana", "Alemanha"],
  ["netherlands", "Países Baixos"],
  ["inglaterra", "Reino Unido"],
  ["australia", "Austrália"],
  ["bulgaria", "Bulgária"],
  ["bahia", "Brasil"],
  ["paris", ""], // cidade, não país
  ["n-a", "N/A"],
  ["-", "N/A"]
]);

const SUSPICIOUS_COUNTRY = new Set([
  "bahia",
  "paris",
  "emirados-arabes"
]);

function isSuspiciousCountry(raw, cityKeys) {
  const key = slugify(raw);
  if (!key) return true;
  if (raw === "N/A") return false;
  if (SUSPICIOUS_COUNTRY.has(key)) return true;
  if (cityKeys.has(key)) return true;
  if (/[0-9]/.test(raw)) return true;
  if (raw.includes(",")) return true;
  return false;
}

function isSuspiciousCity(raw) {
  const v = clean(raw);
  if (!v) return false;
  if (v === "-" || v.toLowerCase() === "n/a") return false;
  if (/\b(spain|france|italy|germany|brasil|brazil|mexico|usa|uk)\b/i.test(v)) return true;
  return false;
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

  const cityKeys = new Set(items.map((i) => slugify(i.city)).filter(Boolean));

  let fixed = 0;
  let flagged = 0;
  const report = [];

  for (const it of items) {
    const before = { country: it.country, city: it.city };

    const countryKey = slugify(it.country);
    if (COUNTRY_FIXES.has(countryKey)) {
      const next = COUNTRY_FIXES.get(countryKey);
      it.country = next || null;
      if (countryKey === "bahia" && !clean(it.city)) {
        it.city = "Bahia";
      }
      fixed += 1;
    }

    if (!clean(it.country) || it.country === "-") {
      it.country = "N/A";
      fixed += 1;
    }
    if (!clean(it.city) || it.city === "-") {
      it.city = "N/A";
      fixed += 1;
    }

    const countryRaw = clean(it.country);
    const cityRaw = clean(it.city);
    if (cityRaw.match(/\((spain|espanha)\)/i)) {
      it.city = cityRaw.replace(/\s*\((spain|espanha)\)\s*/i, "").trim();
      fixed += 1;
    }

    const countryIssue = countryRaw ? isSuspiciousCountry(countryRaw, cityKeys) : false;
    const cityIssue = isSuspiciousCity(cityRaw);

    if (countryIssue || cityIssue) {
      it.reviewFlags = { ...(it.reviewFlags || {}), country: countryIssue, city: cityIssue };
      flagged += 1;
      report.push({ id: it.id, name: it.name, country: it.country, city: it.city });
    }

    if (before.country !== it.country || before.city !== it.city) {
      it.updatedAt = new Date().toISOString();
    }
  }

  db.items = items;
  db.updatedAt = new Date().toISOString();
  saveDb(db);

  fs.writeFileSync(REPORT_PATH, JSON.stringify({ fixed, flagged, sample: report.slice(0, 50) }, null, 2), "utf-8");
  console.log(`✅ location flags: fixed ${fixed}, flagged ${flagged}`);
  console.log(`📄 Report: ${REPORT_PATH}`);
}

main();
