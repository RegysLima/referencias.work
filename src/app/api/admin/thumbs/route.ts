import { NextResponse } from "next/server";

const DEFAULT_PAGES = [
  "",
  "/projects",
  "/project",
  "/work",
  "/works",
  "/portfolio",
  "/cases",
  "/case-studies",
  "/case-study",
  "/index",
  "/projetos",
  "/projeto",
  "/trabalhos",
  "/trabalho",
  "/portifolio",
  "/portfólio",
  "/sobre",
  "/about",
] as const;

function normalizeBaseUrl(input: string) {
  const u = new URL(input);
  u.hash = "";
  u.search = "";
  // remove trailing slash do pathname, mas preserva "/" root
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.toString();
}

function absUrl(base: string, maybe: string) {
  try {
    return new URL(maybe, base).toString();
  } catch {
    return "";
  }
}

function uniq(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const v = (s || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function looksLikeImage(url: string) {
  const u = url.toLowerCase();
  if (u.startsWith("data:")) return false;
  // aceita querystring sem extensão, mas dá preferência a padrões de imagem
  return (
    u.includes(".jpg") ||
    u.includes(".jpeg") ||
    u.includes(".png") ||
    u.includes(".webp") ||
    u.includes(".gif") ||
    u.includes("wp-content/uploads") ||
    u.includes("/uploads/") ||
    u.includes("/images/") ||
    u.includes("image")
  );
}

function isLikelyGarbage(url: string) {
  const u = url.toLowerCase();
  return (
    u.includes("logo") ||
    u.includes("favicon") ||
    u.includes("sprite") ||
    u.includes("icon") ||
    u.includes("analytics") ||
    u.includes("doubleclick") ||
    u.includes("pixel") ||
    u.includes("tracking")
  );
}

function scoreImage(url: string) {
  const u = url.toLowerCase();
  let score = 0;

  // prioridade WP uploads / assets
  if (u.includes("wp-content/uploads")) score += 7;
  if (u.includes("/uploads/")) score += 5;
  if (u.includes("/images/")) score += 3;
  if (u.includes("cdn")) score += 2;

  // sinais de “case/work”
  if (u.includes("work") || u.includes("project") || u.includes("case") || u.includes("portfolio")) score += 3;

  // penaliza “garbage”
  if (isLikelyGarbage(u)) score -= 10;

  // extensões
  if (u.includes(".webp")) score += 1;
  if (u.includes(".jpg") || u.includes(".jpeg") || u.includes(".png")) score += 1;

  return score;
}

async function fetchText(url: string, timeoutMs = 8000) {
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
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8,es;q=0.7",
      },
    });

    if (!res.ok) throw new Error(`HTTP_${res.status}`);

    const ct = res.headers.get("content-type") || "";
    // wp-json retorna application/json
    const text = await res.text();
    return { text, contentType: ct };
  } finally {
    clearTimeout(t);
  }
}

function extractFromHtml(pageUrl: string, html: string) {
  const out: string[] = [];

  // og:image
  {
    const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (og?.[1]) {
      const u = absUrl(pageUrl, og[1]);
      if (u) out.push(u);
    }
  }

  // twitter:image
  {
    const tw = html.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
    if (tw?.[1]) {
      const u = absUrl(pageUrl, tw[1]);
      if (u) out.push(u);
    }
  }

  // <img src="">
  {
    const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const u = absUrl(pageUrl, m[1]);
      if (u) out.push(u);
    }
  }

  // <img data-src="">
  {
    const re = /<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const u = absUrl(pageUrl, m[1]);
      if (u) out.push(u);
    }
  }

  // srcset / data-srcset
  {
    const re = /<img[^>]+(?:srcset|data-srcset)=["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const parts = (m[1] || "")
        .split(",")
        .map((x) => x.trim().split(/\s+/)[0])
        .filter(Boolean);
      for (const p of parts) {
        const u = absUrl(pageUrl, p);
        if (u) out.push(u);
      }
    }
  }

  // background-image: url(...)
  {
    const re = /background-image\s*:\s*url\(([^)]+)\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const raw = (m[1] || "").trim().replace(/^['"]|['"]$/g, "");
      const u = absUrl(pageUrl, raw);
      if (u) out.push(u);
    }
  }

  // <a href="...jpg">
  {
    const re = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const u = absUrl(pageUrl, m[1]);
      if (u) out.push(u);
    }
  }

  // JSON-LD (às vezes tem "image": "...")
  {
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const chunk = m[1] || "";
      // extrai strings que parecem URL de imagem dentro do JSON
      const urlRe = /"([^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/gi;
      let u: RegExpExecArray | null;
      while ((u = urlRe.exec(chunk))) {
        const abs = absUrl(pageUrl, u[1]);
        if (abs) out.push(abs);
      }
    }
  }

  return out;
}

async function tryWpJsonMedia(base: string) {
  const results: string[] = [];
  const wpCandidates = [
    `${base.replace(/\/$/, "")}/wp-json/wp/v2/media?per_page=50&page=1`,
    `${base.replace(/\/$/, "")}/wp-json/wp/v2/media?per_page=50&page=2`,
  ];

  for (const url of wpCandidates) {
    try {
      const { text, contentType } = await fetchText(url, 9000);
      if (!contentType.toLowerCase().includes("application/json")) continue;
      const json = JSON.parse(text);
      if (!Array.isArray(json)) continue;

      for (const item of json) {
        const src = typeof item?.source_url === "string" ? item.source_url : "";
        if (src) results.push(src);
      }
    } catch {
      // ignora
    }
  }

  return results;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url") || "";

  try {
    const base = normalizeBaseUrl(raw);

    // monta lista de páginas “prováveis”
    const pages = uniq(
      DEFAULT_PAGES.map((p) => {
        if (!p) return base;
        return base.replace(/\/$/, "") + p;
      })
    );

    const collected: string[] = [];

    // 1) varre HTML dessas páginas
    for (const pageUrl of pages) {
      try {
        const { text, contentType } = await fetchText(pageUrl, 8000);
        if (!contentType.toLowerCase().includes("text/html")) continue;
        collected.push(...extractFromHtml(pageUrl, text));
      } catch {
        // ignora páginas bloqueadas / 404
      }
    }

    // 2) tenta WP JSON media (pega wp-content/uploads de forma ótima)
    collected.push(...(await tryWpJsonMedia(base)));

    // filtra + rankeia
    const filtered = uniq(collected)
      .map((u) => u.trim())
      .filter(Boolean)
      .filter((u) => looksLikeImage(u))
      .filter((u) => !isLikelyGarbage(u));

    const ranked = filtered
      .sort((a, b) => scoreImage(b) - scoreImage(a))
      .slice(0, 60);

    return NextResponse.json({ candidates: ranked });
  } catch {
    return NextResponse.json({ candidates: [] }, { status: 400 });
  }
}
