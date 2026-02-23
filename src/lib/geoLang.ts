import type { Lang } from "@/lib/i18n";

const PT_COUNTRIES = new Set([
  "BR",
  "PT",
  "AO",
  "MZ",
  "CV",
  "GW",
  "ST",
  "TL",
  "MO",
]);

const ES_COUNTRIES = new Set([
  "ES",
  "MX",
  "AR",
  "CO",
  "PE",
  "VE",
  "CL",
  "EC",
  "GT",
  "CU",
  "BO",
  "DO",
  "HN",
  "PY",
  "SV",
  "NI",
  "CR",
  "PA",
  "UY",
  "GQ",
  "PR",
]);

export function langFromCountryCode(countryCode: string | null | undefined): Lang {
  const code = (countryCode || "").trim().toUpperCase();
  if (!code) return "en";
  if (PT_COUNTRIES.has(code)) return "pt";
  if (ES_COUNTRIES.has(code)) return "es";
  return "en";
}

