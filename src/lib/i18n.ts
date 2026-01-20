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
  if (!entry) return fallback ?? "";
  const raw = entry[lang] || entry.pt;
  const cleaned = (raw || "").toString().replace(/<[^>]+>/g, "").trim();
  if (cleaned) return cleaned;
  const fallbackClean = (fallback || "").toString().replace(/<[^>]+>/g, "").trim();
  return fallbackClean || "";
}

export function getMacroLabel(key: string, lang: Lang) {
  const macros = UI[lang]?.macros || UI.pt.macros;
  return macros[key] || key;
}
