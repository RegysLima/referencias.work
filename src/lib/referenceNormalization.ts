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

const AREA_FALLBACK_CATALOG = [
  "Branding",
  "Design Gráfico",
  "Tipografia",
  "Embalagem",
  "Digital",
  "Editorial",
  "Ilustração",
  "Fotografia",
  "Motion",
  "3D",
  "Direção de Arte",
  "Identidade Visual",
];

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

function areaLabelKey(value: string | null | undefined) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitAreaCandidates(value: string | null | undefined) {
  return (value || "")
    .split(/[\n\r,;|/]+/g)
    .map((part) => canonAreaLabel(part))
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildAreaCatalog(items: Reference[]) {
  const values: string[] = [...AREA_FALLBACK_CATALOG];
  for (const it of items) {
    values.push(...splitAreaCandidates(it.areaPrimary || ""));
    for (const s of it.areasSecondary || []) {
      values.push(...splitAreaCandidates(s));
    }
  }
  return uniq(values);
}

function splitCompoundAreaByCatalog(value: string | null | undefined, catalog: string[]) {
  const source = clean(value);
  if (!source) return [];
  if (/[\n\r,;|/]/.test(source)) return splitAreaCandidates(source);

  const normalized = areaLabelKey(source);
  if (!normalized) return [];
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [canonAreaLabel(source)];

  const entries = uniq(catalog)
    .map((label) => {
      const key = areaLabelKey(label);
      const tokens = key.split(/\s+/).filter(Boolean);
      return { label: canonAreaLabel(label), tokens };
    })
    .filter((entry) => entry.tokens.length > 0)
    .sort((a, b) => b.tokens.length - a.tokens.length);

  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let match: { label: string; len: number } | null = null;
    for (const entry of entries) {
      if (entry.tokens.length > words.length - i) continue;
      let ok = true;
      for (let j = 0; j < entry.tokens.length; j += 1) {
        if (entry.tokens[j] !== words[i + j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        match = { label: entry.label, len: entry.tokens.length };
        break;
      }
    }
    if (!match) return [canonAreaLabel(source)];
    out.push(match.label);
    i += match.len;
  }

  return out.length >= 2 ? out : [canonAreaLabel(source)];
}

function expandAreaTokens(value: string | null | undefined) {
  return splitAreaCandidates(value);
}

function normalizeSecondaryAreas(primary: string | null | undefined, secondary: string[] | undefined) {
  const primaryLabel = canonAreaLabel(primary);
  const primaryCanon = primaryLabel.toLowerCase();
  const base = (secondary || [])
    .flatMap((item) => expandAreaTokens(item));
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

function isNotApplicable(value: string | null | undefined) {
  const normalized = (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized === "n a" || normalized === "na" || normalized === "nao se aplica";
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
  if (item.locationNA) return undefined;
  if (!item.reviewFlags) return item.reviewFlags;
  const next = { ...item.reviewFlags };
  if (next.country && clean(item.country)) delete next.country;
  if (next.city && clean(item.city)) delete next.city;
  if (!next.country && !next.city) return undefined;
  return next;
}

export function normalizeReferenceItem(input: Reference, areaCatalog: string[]): Reference {
  const macroType = normalizeMacro(input.macroType || input.type || "");
  const primaryTokens = splitCompoundAreaByCatalog(input.areaPrimary || "", areaCatalog);
  const areaPrimary = primaryTokens[0] || null;
  const secondaryTokens = (input.areasSecondary || []).flatMap((entry) =>
    splitCompoundAreaByCatalog(entry, areaCatalog)
  );
  const areasSecondary = normalizeSecondaryAreas(areaPrimary, [...primaryTokens.slice(1), ...secondaryTokens]);
  const explicitNA = Boolean(input.locationNA);
  const inferredNA = isNotApplicable(input.country) || isNotApplicable(input.city);
  const locationNA = explicitNA || inferredNA;
  const locations = locationNA
    ? []
    : normalizeLocations(input.locations, input.country || null, input.city || null);
  const country = locationNA
    ? "N/A"
    : locations[0]?.country
    ? normalizeCountryValue(locations[0].country || null)
    : null;
  const city = locationNA
    ? "N/A"
    : locations[0]?.city
    ? normalizeCityValue(locations[0].city || null)
    : null;

  const normalized: Reference = {
    ...input,
    macroType,
    areaPrimary,
    areasSecondary,
    tags: normalizeTags(areaPrimary, areasSecondary),
    country,
    city,
    locationNA,
    locations,
    updatedAt: input.updatedAt || new Date().toISOString(),
  };

  normalized.reviewFlags = normalizeReviewFlags(normalized);
  return normalized;
}

export function normalizeReferenceDb(db: ReferenceDB) {
  const beforeItems = Array.isArray(db.items) ? db.items : [];
  const areaCatalog = buildAreaCatalog(beforeItems);
  let changedItems = 0;

  const items = beforeItems.map((item) => {
    const normalized = normalizeReferenceItem(item, areaCatalog);
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
