import ui from "@/data/i18n/ui.json";
import areas from "@/data/i18n/areas.json";
import countries from "@/data/i18n/countries.json";
import cities from "@/data/i18n/cities.json";

export type Lang = "pt" | "en" | "es";

export const ALL_KEY = "__all__";

type LabelEntry = {
  pt: string;
  en?: string;
  es?: string;
};

type LabelMap = Record<string, LabelEntry>;

export const UI = ui as Record<
  Lang,
  {
    all: string;
    filters: {
      toggle: string;
      search: string;
      category: string;
      areaPrimary: string;
      areaSecondary: string;
      country: string;
      city: string;
      clear: string;
      results: string;
    };
    spotlight: string;
    visit: string;
    loadMore: string;
    noImage: string;
    macros: Record<string, string>;
  }
>;

export const AREA_LABELS = areas as LabelMap;
export const COUNTRY_LABELS = countries as LabelMap;
export const CITY_LABELS = cities as LabelMap;

function decodeHtmlEntities(value: string) {
  return (value || "")
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#([0-9]+);?/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanLabel(value: string | undefined) {
  return decodeHtmlEntities((value || "").toString())
    .replace(/<[^>]+>/g, "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/[\u00A0\s]+/g, " ")
    .replace(/^[\s"'`“”‘’«»‹›:;,.!?{}\-\u2013\u2014]+/g, "")
    .trim()
    .replace(/[\s"'`“”‘’«»‹›:;,.!?{}\-\u2013\u2014]+$/g, "")
    .trim();
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getLabel(map: LabelMap, key: string, lang: Lang, fallback?: string) {
  const entry = map[key];
  if (!entry) return cleanLabel(fallback);
  const raw = entry[lang] || entry.pt;
  const cleaned = cleanLabel(raw);
  if (cleaned) return cleaned;
  const fallbackClean = cleanLabel(fallback);
  return fallbackClean || "";
}

export function getMacroLabel(key: string, lang: Lang) {
  const macros = UI[lang]?.macros || UI.pt.macros;
  return macros[key] || key;
}
