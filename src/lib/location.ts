import { slugify } from "@/lib/i18n";

function cleanLocationValue(value: string) {
  return (value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\u00A0\s]+/g, " ")
    .trim()
    .replace(/[\s.,;:!\-–—]+$/g, "")
    .trim();
}

function normalizeLocationKey(value: string) {
  return cleanLocationValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COUNTRY_ALIASES: Record<string, string> = {
  alemanha: "Alemanha",
  germany: "Alemanha",
  deutschland: "Alemanha",

  "estados unidos": "Estados Unidos",
  "united states": "Estados Unidos",
  "united states of america": "Estados Unidos",
  usa: "Estados Unidos",
  us: "Estados Unidos",
  "u s a": "Estados Unidos",
  eua: "Estados Unidos",

  "reino unido": "Reino Unido",
  "united kingdom": "Reino Unido",
  uk: "Reino Unido",
  "great britain": "Reino Unido",
  england: "Reino Unido",

  "paises baixos": "Países Baixos",
  "paises baixo": "Países Baixos",
  netherlands: "Países Baixos",
  "the netherlands": "Países Baixos",
  holland: "Países Baixos",

  suica: "Suíça",
  switzerland: "Suíça",
};

const CITY_ALIASES: Record<string, string> = {
  berlin: "Berlim",
  berlim: "Berlim",

  "new york": "Nova York",
  "new york city": "Nova York",
  nyc: "Nova York",
  "nova york": "Nova York",

  viena: "Viena",
  vienna: "Viena",

  "a coruna": "A Coruña",
  "a coruna spain": "A Coruña",
  "a coruna sp": "A Coruña",

  "mexico city": "Cidade do México",
  "cidade do mexico": "Cidade do México",
  "ciudad de mexico": "Cidade do México",

  london: "Londres",
  londres: "Londres",

  "sao paulo": "São Paulo",
  "sao paulo city": "São Paulo",
};

export function canonicalCountry(value: string | null | undefined) {
  const cleaned = cleanLocationValue(value || "");
  if (!cleaned) return "";
  const alias = COUNTRY_ALIASES[normalizeLocationKey(cleaned)];
  return alias || cleaned;
}

export function canonicalCity(value: string | null | undefined) {
  const cleaned = cleanLocationValue(value || "");
  if (!cleaned) return "";
  const alias = CITY_ALIASES[normalizeLocationKey(cleaned)];
  return alias || cleaned;
}

export function countryKey(value: string | null | undefined) {
  return slugify(canonicalCountry(value || ""));
}

export function cityKey(value: string | null | undefined) {
  return slugify(canonicalCity(value || ""));
}
