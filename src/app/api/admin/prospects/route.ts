import { NextResponse } from "next/server";
import type { ProspectItem } from "@/lib/types";
import { readProspectsDb, writeProspectsDb } from "@/lib/prospectsDb";
import { readReferencesDb, writeReferencesDb } from "@/lib/referencesDb";
import { canonicalCity, canonicalCountry } from "@/lib/location";

function normalizeUrlKey(value: string) {
  try {
    const url = new URL((value || "").trim());
    const path = url.pathname.replace(/\/+$/, "");
    url.hash = "";
    url.search = "";
    return `${url.protocol}//${url.host}${path}`.toLowerCase();
  } catch {
    return (value || "").trim().toLowerCase();
  }
}

function decodeHtmlEntities(value: string) {
  return (value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function absUrl(base: string, maybe: string) {
  try {
    return new URL(maybe, base).toString();
  } catch {
    return "";
  }
}

function normalizeImageCandidate(pageUrl: string, raw: string) {
  const decoded = decodeHtmlEntities((raw || "").trim());
  if (!decoded) return "";
  const absolute = absUrl(pageUrl, decoded);
  if (!absolute) return "";

  try {
    const url = new URL(absolute);
    if (url.pathname.includes("/_next/image")) {
      const inner = url.searchParams.get("url") || "";
      if (inner) return absUrl(pageUrl, decodeHtmlEntities(inner));
    }
    return url.toString();
  } catch {
    return absolute;
  }
}

function inferMacroType(prospect: ProspectItem) {
  const bag = [
    prospect.displayName || "",
    prospect.domain || "",
    prospect.homepageUrl || "",
    ...((prospect.sources || []).flatMap((row) => [row.label || "", row.sourcePageUrl || ""])),
  ]
    .join(" ")
    .toLowerCase();

  if (/(photographer|photography|foto|fotografia)/i.test(bag)) return "Photographers";
  if (/(illustrator|illustration|ilustr)/i.test(bag)) return "Illustrators";
  if (/(foundry|typeface|font|typography|tipografia)/i.test(bag)) return "Foundries";
  if (/(designer|design)/i.test(bag)) return "Designers";
  return "Studios";
}

async function fetchHtml(url: string, timeoutMs = 6500) {
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
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return "";
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html")) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

function extractImageCandidates(pageUrl: string, html: string) {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const u = normalizeImageCandidate(pageUrl, value);
    if (!u) return;
    if (seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (og?.[1]) push(og[1]);
  const tw = html.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  if (tw?.[1]) push(tw[1]);

  const imgRe = /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    push(m[1]);
  }

  const srcsetRe = /<img[^>]+(?:srcset|data-srcset)=["']([^"']+)["'][^>]*>/gi;
  while ((m = srcsetRe.exec(html))) {
    const parts = (m[1] || "")
      .split(",")
      .map((x) => x.trim().split(/\s+/)[0])
      .filter(Boolean);
    for (const part of parts) push(part);
  }

  return out;
}

async function firstReachableImage(candidates: string[]) {
  for (const url of candidates.slice(0, 20)) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        cache: "no-store",
        signal: ctrl.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (res.ok && ct.startsWith("image/")) return url;
    } catch {
      // ignore
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

function extractLocationFromHtml(html: string) {
  const text = decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  );

  const based = text.match(
    /\b(?:based in|located in|estudio em|studio in|office in)\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ.' -]{1,50})(?:,\s*|\s+)([A-ZÀ-ÿ][A-Za-zÀ-ÿ.' -]{1,50})/i
  );
  if (based?.[1] || based?.[2]) {
    return {
      city: canonicalCity((based[1] || "").trim()) || null,
      country: canonicalCountry((based[2] || "").trim()) || null,
    };
  }

  const cityCountry = text.match(
    /\b([A-ZÀ-ÿ][A-Za-zÀ-ÿ.' -]{1,40})\s*(?:,|•|-)\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿ.' -]{1,40})\b/
  );
  if (cityCountry?.[1] || cityCountry?.[2]) {
    return {
      city: canonicalCity((cityCountry[1] || "").trim()) || null,
      country: canonicalCountry((cityCountry[2] || "").trim()) || null,
    };
  }

  return { city: null, country: null };
}

async function enrichProspect(prospect: ProspectItem) {
  const now = new Date().toISOString();
  const fallbackUrl = prospect.domain ? `https://${prospect.domain}` : "";
  const url = (prospect.homepageUrl || fallbackUrl).trim();
  const name = (prospect.displayName || prospect.domain || "Nova referência").trim();
  const uid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

  const macroType = inferMacroType(prospect);

  const pages = [
    url,
    absUrl(url, "/"),
    absUrl(url, "/work"),
    absUrl(url, "/works"),
    absUrl(url, "/projects"),
    absUrl(url, "/portfolio"),
    absUrl(url, "/about"),
    absUrl(url, "/about-us"),
    absUrl(url, "/contact"),
    absUrl(url, "/info"),
  ].filter(Boolean);

  let thumbnailUrl: string | null = null;
  let country: string | null = null;
  let city: string | null = null;

  for (const page of pages.slice(0, 6)) {
    const html = await fetchHtml(page);
    if (!html) continue;

    if (!thumbnailUrl) {
      const imageCandidates = extractImageCandidates(page, html);
      thumbnailUrl = await firstReachableImage(imageCandidates);
    }

    if (!country && !city) {
      const loc = extractLocationFromHtml(html);
      if (loc.country || loc.city) {
        country = loc.country;
        city = loc.city;
      }
    }

    if (thumbnailUrl && (country || city)) break;
  }

  return {
    id: `prospect-${prospect.id}-${uid}`,
    name,
    url,
    type: macroType,
    macroType,
    areaPrimary: "",
    areasSecondary: [],
    tags: [],
    country,
    city,
    locations: country || city ? [{ country, city }] : [],
    thumbnailUrl,
    thumbnailSource: thumbnailUrl ? "picker" : "manual",
    hidden: true,
    updatedAt: now,
    reviewedAt: null,
  };
}

async function syncApprovedProspectsToReferences(prospects: ProspectItem[]) {
  const approved = prospects.filter((item) => item.status === "approved");
  if (!approved.length) return;

  const refDb = await readReferencesDb();
  const existingUrlKeys = new Set(refDb.items.map((item) => normalizeUrlKey(item.url)));
  let changed = false;

  for (const item of approved) {
    const candidate = await enrichProspect(item);
    const key = normalizeUrlKey(candidate.url);
    if (!key || key === "https://") continue;
    if (existingUrlKeys.has(key)) continue;
    existingUrlKeys.add(key);
    refDb.items = [candidate, ...refDb.items];
    changed = true;
  }

  if (!changed) return;
  refDb.count = refDb.items.length;
  refDb.updatedAt = new Date().toISOString();
  await writeReferencesDb(refDb);
}

export async function GET() {
  const db = await readProspectsDb();
  await syncApprovedProspectsToReferences(db.items);
  return NextResponse.json(db);
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    status?: ProspectItem["status"];
    notes?: string | null;
  };

  const id = (body.id || "").trim();
  const status = body.status;
  const notes = body.notes;

  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const hasStatus = typeof status === "string";
  const hasNotes = typeof notes === "string" || notes === null;

  if (!hasStatus && !hasNotes) {
    return NextResponse.json({ ok: false, error: "no_changes" }, { status: 400 });
  }

  const isValidStatus =
    status === "new" || status === "waiting" || status === "approved" || status === "rejected";
  if (hasStatus && !isValidStatus) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const db = await readProspectsDb();
  let found = false;
  let approvedItem: ProspectItem | null = null;

  if (status === "rejected") {
    const next = db.items.filter((item) => {
      if (item.id === id) {
        found = true;
        return false;
      }
      return true;
    });
    db.items = next;
  } else {
    db.items = db.items.map((item) => {
      if (item.id !== id) return item;
      found = true;
      if (status === "approved") approvedItem = item;
      return {
        ...item,
        status: hasStatus ? (status as ProspectItem["status"]) : item.status,
        notes: hasNotes ? (notes || null) : item.notes || null,
      };
    });
  }

  if (!found) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  db.count = db.items.length;
  db.updatedAt = new Date().toISOString();
  await writeProspectsDb(db);

  if (status === "approved" && approvedItem) {
    await syncApprovedProspectsToReferences([approvedItem]);
  }

  return NextResponse.json({ ok: true });
}
