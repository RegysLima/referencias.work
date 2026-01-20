import { NextResponse } from "next/server";

function normalizeBaseUrl(input: string) {
  const u = new URL(input);
  u.hash = "";
  u.search = "";
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.toString();
}

function getOriginAndPath(input: string) {
  const u = new URL(input);
  const origin = `${u.protocol}//${u.host}`;
  const path = u.pathname.replace(/\/+$/, "") || "/";
  return { origin, path };
}

async function fetchHtml(url: string, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8,es;q=0.7",
      },
    });

    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("text/html")) throw new Error("NOT_HTML");
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function extractJsonLdAddress(html: string): { city?: string; country?: string } {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
  }

  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const chunk = m[1] || "";
    try {
      const parsed = JSON.parse(chunk);

      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      const objects: Record<string, unknown>[] = [];

      while (queue.length) {
        const obj = queue.shift();
        if (!isRecord(obj)) continue;
        objects.push(obj);
        const graph = obj["@graph"];
        if (Array.isArray(graph)) queue.push(...graph);
      }

      for (const obj of objects) {
        const addrCandidates: unknown[] = [];
        const addressVal = obj["address"];
        if (addressVal) addrCandidates.push(addressVal);

        const locationVal = obj["location"];
        if (isRecord(locationVal) && locationVal["address"]) {
          addrCandidates.push(locationVal["address"]);
        }
        if (Array.isArray(locationVal)) {
          for (const loc of locationVal) {
            if (isRecord(loc) && loc["address"]) addrCandidates.push(loc["address"]);
          }
        }

        const flatCandidates = addrCandidates.flatMap((v) => (Array.isArray(v) ? v : [v]));
        for (const addr of flatCandidates) {
          if (!isRecord(addr)) continue;

          const city =
            typeof addr["addressLocality"] === "string"
              ? (addr["addressLocality"] as string)
              : typeof addr["addressRegion"] === "string"
              ? (addr["addressRegion"] as string)
              : undefined;

          const addrCountry = addr["addressCountry"];
          const country =
            typeof addrCountry === "string"
              ? addrCountry
              : isRecord(addrCountry) && typeof addrCountry["name"] === "string"
              ? (addrCountry["name"] as string)
              : undefined;

          if (city || country) return { city, country };
        }
      }
    } catch {
      // ignora JSON inválido
    }
  }

  return {};
}

function clean(s?: string) {
  const v = (s || "").trim();
  return v || undefined;
}

function extractByRegex(html: string): { city?: string; country?: string } {
  const keywords = [
    "contact",
    "contato",
    "address",
    "endereço",
    "endereco",
    "location",
    "studio",
    "office",
    "impressum",
    "about",
    "sobre",
  ];

  function stripToLines(raw: string) {
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|section|address|footer|header|article|main|span|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " ")
      .split(/\n+/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function isNoise(s: string) {
    const v = s.toLowerCase();
    return (
      v.includes("@") ||
      v.includes("http") ||
      v.includes("www") ||
      /\d{3,}/.test(v)
    );
  }

  function extractCityCountryFromText(text: string) {
    const re =
      /([A-ZÁÉÍÓÚÂÊÔÃÕÄËÏÖÜ][A-Za-zÀ-ÿ.'-]{1,40}(?:\s+[A-Za-zÀ-ÿ.'-]{1,40}){0,3})\s*(?:,|–|-|•)\s*([A-ZÁÉÍÓÚÂÊÔÃÕÄËÏÖÜ][A-Za-zÀ-ÿ.'-]{1,40}(?:\s+[A-Za-zÀ-ÿ.'-]{1,40}){0,3})/;
    const m = text.match(re);
    if (!m) return null;
    if (isNoise(m[1]) || isNoise(m[2])) return null;
    return { city: clean(m[1]), country: clean(m[2]) };
  }

  function extractCityStateCountry(text: string) {
    const re =
      /([A-ZÁÉÍÓÚÂÊÔÃÕÄËÏÖÜ][A-Za-zÀ-ÿ.'-]{1,40}(?:\s+[A-Za-zÀ-ÿ.'-]{1,40}){0,3})\s+([A-Z]{2,3})\s+\d{3,5}/;
    const m = text.match(re);
    if (!m) return null;
    if (isNoise(m[1])) return null;

    const state = m[2].toUpperCase();
    const usStates = new Set([
      "AL",
      "AK",
      "AZ",
      "AR",
      "CA",
      "CO",
      "CT",
      "DE",
      "FL",
      "GA",
      "HI",
      "ID",
      "IL",
      "IN",
      "IA",
      "KS",
      "KY",
      "LA",
      "ME",
      "MD",
      "MA",
      "MI",
      "MN",
      "MS",
      "MO",
      "MT",
      "NE",
      "NV",
      "NH",
      "NJ",
      "NM",
      "NY",
      "NC",
      "ND",
      "OH",
      "OK",
      "OR",
      "PA",
      "RI",
      "SC",
      "SD",
      "TN",
      "TX",
      "UT",
      "VT",
      "VA",
      "WA",
      "WV",
      "WI",
      "WY",
      "DC",
    ]);
    const auStates = new Set(["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);
    const caProvinces = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);

    if (usStates.has(state)) return { city: clean(m[1]), country: "Estados Unidos" };
    if (auStates.has(state)) return { city: clean(m[1]), country: "Austrália" };
    if (caProvinces.has(state)) return { city: clean(m[1]), country: "Canadá" };

    return { city: clean(m[1]) };
  }

  function extractCityFromAddressLine(text: string) {
    const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const last = parts[parts.length - 1];
    if (isNoise(last)) return null;
    // heurística: endereço tem número ou palavras comuns de rua
    const hasAddressCue = /\d{2,}/.test(text) || /(rua|street|st\.|avenida|av\.|strasse|straße|calle|via|road|rd\.)/i.test(text);
    if (!hasAddressCue) return null;
    // cidade com letra inicial maiúscula
    if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÄËÏÖÜ]/.test(last)) return null;
    return { city: clean(last) };
  }

  const addressBlocks: string[] = [];
  const addressRe = /<address[^>]*>([\s\S]*?)<\/address>/gi;
  let addrMatch: RegExpExecArray | null;
  while ((addrMatch = addressRe.exec(html))) {
    addressBlocks.push(stripToLines(addrMatch[1]).join(" "));
  }

  for (const block of addressBlocks) {
    const hit = extractCityCountryFromText(block);
    if (hit) return hit;
    const stateHit = extractCityStateCountry(block);
    if (stateHit) return stateHit;
    const cityOnly = extractCityFromAddressLine(block);
    if (cityOnly) return cityOnly;
  }

  function tryLines(lines: string[]) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLow = line.toLowerCase();
      if (!keywords.some((k) => lineLow.includes(k))) continue;

      const combo = [line, lines[i + 1] || "", lines[i + 2] || ""].join(" ");
      const hit = extractCityCountryFromText(combo);
      if (hit) return hit;

      const stateHit = extractCityStateCountry(combo);
      if (stateHit) return stateHit;

      const cityOnly = extractCityFromAddressLine(combo);
      if (cityOnly) return cityOnly;
    }
    return null;
  }

  const contactIdx = html.toLowerCase().indexOf('id="contact"');
  if (contactIdx >= 0) {
    const slice = html.slice(Math.max(0, contactIdx - 1500), contactIdx + 4000);
    const hit = tryLines(stripToLines(slice));
    if (hit) return hit;
  }

  const lines = stripToLines(html);
  const hit = tryLines(lines);
  if (hit) return hit;

  return {};
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url") || "";

  try {
    const base = normalizeBaseUrl(raw);
    const { origin, path: basePath } = getOriginAndPath(raw);
    const root = origin;
    const basePage = basePath === "/" ? origin : `${origin}${basePath}`;

    const pages = [
      base,
      root,
      basePage,
      `${root}/contact`,
      `${root}/contato`,
      `${root}/about`,
      `${root}/sobre`,
      `${root}/impressum`,
      `${root}/studio`,
      `${root}/work`,
    ];

    for (const p of pages) {
      try {
        const html = await fetchHtml(p, 8000);

        const fromLd = extractJsonLdAddress(html);
        if (fromLd.city || fromLd.country) {
          return NextResponse.json({
            city: clean(fromLd.city),
            country: clean(fromLd.country),
            source: p,
            method: "jsonld",
          });
        }

        const fromRegex = extractByRegex(html);
        if (fromRegex.city || fromRegex.country) {
          return NextResponse.json({
            city: clean(fromRegex.city),
            country: clean(fromRegex.country),
            source: p,
            method: "regex",
          });
        }
      } catch {
        // ignora página
      }
    }

    return NextResponse.json({ city: null, country: null, source: null, method: null });
  } catch {
    return NextResponse.json({ city: null, country: null, source: null, method: null }, { status: 400 });
  }
}
