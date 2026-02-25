import { slugify } from "@/lib/i18n";

function decodeHtmlEntities(value: string) {
  return value
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

function cleanLocationValue(value: string) {
  return decodeHtmlEntities(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/[\u00A0\s]+/g, " ")
    .replace(/^[\s"'`“”‘’«»‹›:;,.!?()[\]{}\-–—]+/g, "")
    .trim()
    .replace(/[\s"'`“”‘’«»‹›:;,.!?()[\]{}\-–—]+$/g, "")
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

  // Estados/UFs comuns vindos de extrações inconsistentes
  "sao paulo": "Brasil",
  "rio de janeiro": "Brasil",
  bahia: "Brasil",
  ceara: "Brasil",
  pernambuco: "Brasil",
  parana: "Brasil",
  "rio grande do sul": "Brasil",
  "minas gerais": "Brasil",
  sc: "Brasil",
  sp: "Brasil",
  rj: "Brasil",
  rs: "Brasil",
  pr: "Brasil",
  mg: "Brasil",
  ba: "Brasil",
  ce: "Brasil",
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
  seoul: "Seoul",
  seul: "Seoul",
};

export function canonicalCountry(value: string | null | undefined) {
  const cleaned = cleanLocationValue(value || "");
  if (!cleaned) return "";
  const alias = COUNTRY_ALIASES[normalizeLocationKey(cleaned)];
  return alias || cleaned;
}

export function canonicalCity(value: string | null | undefined) {
  let cleaned = cleanLocationValue(value || "");
  cleaned = cleaned
    .replace(/\s*[|/]\s*.*/g, "")
    .replace(/\s*[,;:]\s*.*/g, "")
    .replace(/\s+[A-Z]{2,3}$/g, "")
    .trim();
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
