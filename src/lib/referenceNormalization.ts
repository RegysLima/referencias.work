import type { Reference, ReferenceDB } from "@/lib/types";
import { canonicalCity, canonicalCountry } from "@/lib/location";

const MACROS = ["Studios", "Designers", "Photographers", "Illustrators", "Foundries"] as const;

const AREA_CANON_MAP: Record<string, string> = {
  packaging: "Embalagem",
  package: "Embalagem",
  "package design": "Embalagem",
  "pack design": "Embalagem",
  embalagens: "Embalagem",
  expografia: "Exposições",
  exibicoes: "Exposições",
  exibições: "Exposições",
  documentary: "Documental",
  "creative coding": "Programação Criativa",
  "creative-coding": "Programação Criativa",
  "design grafico": "Design Gráfico",
  drinks: "Bebidas",
  fashion: "Moda",
  travel: "Viagem",
  "ui/ux": "Digital",
  "ui ux": "Digital",
  ui: "Digital",
  ux: "Digital",
};

function clean(value: string | null | undefined) {
  return (value || "").trim();
}

function uniq(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const v = clean(value);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function normalizeMacro(raw: string | null | undefined) {
  const v = clean(raw);
  const low = v.toLowerCase();

  if ((MACROS as readonly string[]).includes(v)) return v;

  if (low === "studio") return "Studios";
  if (low === "designer") return "Designers";
  if (low === "photographer" || low === "fotografo" || low === "fotógrafo") return "Photographers";
  if (low === "illustrator" || low === "ilustrador") return "Illustrators";
  if (low === "foundry") return "Foundries";

  if (low.includes("studio")) return "Studios";
  if (low.includes("design")) return "Designers";
  if (low.includes("photo") || low.includes("foto")) return "Photographers";
  if (low.includes("illus") || low.includes("ilustr")) return "Illustrators";
  if (low.includes("found")) return "Foundries";

  return v || "Studios";
}

function canonAreaLabel(value: string | null | undefined) {
  const raw = clean(value);
  if (!raw) return "";
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return AREA_CANON_MAP[key] || raw;
}

function normalizeSecondaryAreas(primary: string | null | undefined, secondary: string[] | undefined) {
  const primaryLabel = canonAreaLabel(primary);
  const primaryCanon = primaryLabel.toLowerCase();
  const base = (secondary || [])
    .map((item) => canonAreaLabel(item))
    .map((item) => item.trim())
    .filter(Boolean);
  const filtered = uniq(base).filter((item) => item.toLowerCase() !== primaryCanon);
  return filtered.slice(0, 4);
}

function normalizeTags(areaPrimary: string | null | undefined, areasSecondary: string[] | undefined) {
  return uniq([areaPrimary || "", ...(areasSecondary || [])]);
}

function normalizeCountryValue(value: string | null | undefined) {
  const next = canonicalCountry(value ?? "");
  return next || null;
}

function normalizeCityValue(value: string | null | undefined) {
  const next = canonicalCity(value ?? "");
  return next || null;
}

function normalizeLocations(
  input:
    | Array<{
        country?: string | null;
        city?: string | null;
      }>
    | undefined,
  country: string | null | undefined,
  city: string | null | undefined
) {
  const rows = [
    { country, city },
    ...((input || []).map((row) => ({
      country: row?.country ?? null,
      city: row?.city ?? null,
    })) || []),
  ];

  const out: Array<{ country?: string | null; city?: string | null }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const c = normalizeCountryValue(row.country ?? null);
    const ct = normalizeCityValue(row.city ?? null);
    if (!c && !ct) continue;
    const key = `${(c || "").toLowerCase()}::${(ct || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ country: c, city: ct });
  }
  return out;
}

function normalizeReviewFlags(item: Reference) {
  if (!item.reviewFlags) return item.reviewFlags;
  const next = { ...item.reviewFlags };
  if (next.country && clean(item.country)) delete next.country;
  if (next.city && clean(item.city)) delete next.city;
  if (!next.country && !next.city) return undefined;
  return next;
}

export function normalizeReferenceItem(input: Reference): Reference {
  const macroType = normalizeMacro(input.macroType || input.type || "");
  const areaPrimary = canonAreaLabel(input.areaPrimary || "") || null;
  const areasSecondary = normalizeSecondaryAreas(areaPrimary, input.areasSecondary || []);
  const locations = normalizeLocations(input.locations, input.country || null, input.city || null);
  const country = locations[0]?.country ? normalizeCountryValue(locations[0].country || null) : null;
  const city = locations[0]?.city ? normalizeCityValue(locations[0].city || null) : null;

  const normalized: Reference = {
    ...input,
    macroType,
    areaPrimary,
    areasSecondary,
    tags: normalizeTags(areaPrimary, areasSecondary),
    country,
    city,
    locations,
    updatedAt: input.updatedAt || new Date().toISOString(),
  };

  normalized.reviewFlags = normalizeReviewFlags(normalized);
  return normalized;
}

export function normalizeReferenceDb(db: ReferenceDB) {
  const beforeItems = Array.isArray(db.items) ? db.items : [];
  let changedItems = 0;

  const items = beforeItems.map((item) => {
    const normalized = normalizeReferenceItem(item);
    if (JSON.stringify(item) !== JSON.stringify(normalized)) changedItems += 1;
    return normalized;
  });

  return {
    db: {
      ...db,
      items,
      count: items.length,
      updatedAt: changedItems ? new Date().toISOString() : db.updatedAt,
    },
    stats: {
      total: items.length,
      changedItems,
    },
  };
}
