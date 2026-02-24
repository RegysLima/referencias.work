"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_KEY,
  AREA_LABELS,
  CITY_LABELS,
  COUNTRY_LABELS,
  UI,
  getLabel,
  getMacroLabel,
  slugify,
  type Lang,
} from "@/lib/i18n";
import { canonicalCity, canonicalCountry, cityKey as citySlugKey, countryKey as countrySlugKey } from "@/lib/location";
import { sendAnalyticsEvent } from "@/lib/analyticsClient";

type AnyItem = Record<string, unknown>;

/* ---------------- helpers (resilientes) ---------------- */
function asStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function splitLoose(s: string) {
  return s
    .split(/[,;|\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function asStrArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asStr).filter(Boolean);
  if (typeof v === "string") return splitLoose(v);
  return [];
}

function pickFirstString(it: AnyItem, keys: string[]) {
  for (const k of keys) {
    const v = it?.[k];
    const s = asStr(v);
    if (s) return s;
  }
  return "";
}

function pickFirstArray(it: AnyItem, keys: string[]) {
  for (const k of keys) {
    const v = it?.[k];
    const a = asStrArr(v);
    if (a.length) return a;
  }
  return [];
}

function getName(it: AnyItem) {
  return pickFirstString(it, ["name", "nome", "title", "titulo", "título"]) || "—";
}

function getUrl(it: AnyItem) {
  return pickFirstString(it, ["url", "link", "website", "site"]);
}

function getCountry(it: AnyItem) {
  return getCountries(it)[0] || "";
}

function getCity(it: AnyItem) {
  return getCities(it)[0] || "";
}

function getLocationRows(it: AnyItem) {
  const raw = it?.locations;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const obj = row as Record<string, unknown>;
      const country = canonicalCountry(asStr(obj?.country));
      const city = canonicalCity(asStr(obj?.city));
      if (!country && !city) return null;
      return { country, city };
    })
    .filter((row): row is { country: string; city: string } => Boolean(row));
}

function uniqStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const v = (value || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function getCountries(it: AnyItem) {
  const rows = getLocationRows(it).map((row) => row.country).filter(Boolean);
  const legacy = canonicalCountry(pickFirstString(it, ["country", "pais", "país"]));
  const extras = pickFirstArray(it, ["countries", "paises", "países"]).map((v) => canonicalCountry(v));
  return uniqStrings([legacy, ...rows, ...extras]);
}

function getCities(it: AnyItem) {
  const rows = getLocationRows(it).map((row) => row.city).filter(Boolean);
  const legacy = canonicalCity(pickFirstString(it, ["city", "cidade"]));
  const extras = pickFirstArray(it, ["cities", "cidades"]).map((v) => canonicalCity(v));
  return uniqStrings([legacy, ...rows, ...extras]);
}

function getAdditionalCountryCount(it: AnyItem) {
  return Math.max(0, getCountries(it).length - 1);
}

function getAdditionalCityCount(it: AnyItem) {
  return Math.max(0, getCities(it).length - 1);
}

function getAdditionalLocationCount(it: AnyItem) {
  return Math.max(
    getAdditionalCountryCount(it),
    getAdditionalCityCount(it)
  );
}

function getThumb(it: AnyItem) {
  return pickFirstString(it, ["thumbnailUrl", "thumb", "image", "cover", "thumbUrl", "thumbnail"]);
}

function trackReferenceClick(
  name: string,
  url: string,
  context?: { lang?: string; query?: string; macro?: string }
) {
  sendAnalyticsEvent({
    type: "ref",
    refName: name,
    refUrl: url,
    lang: context?.lang,
    query: context?.query || "",
    value: context?.macro || "",
  });
}

function isVideoUrl(src: string) {
  return /\.(mp4|webm|mov|m4v|ogv|m3u8)(\?|#|$)/i.test(src);
}

function isVimeoUrl(src: string) {
  try {
    const url = new URL(src);
    return /vimeo\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function getVimeoEmbedSrc(src: string) {
  try {
    const url = new URL(src);
    let pathname = url.pathname;
    const playbackMatch = pathname.match(/\/playback\/(\d+)(?:\/|$)/);
    if (playbackMatch) {
      pathname = `/video/${playbackMatch[1]}`;
    }
    if (url.hostname === "vimeo.com") {
      const idMatch = pathname.match(/\/(\d+)(?:$|\/)/);
      if (!idMatch) return src;
      pathname = `/video/${idMatch[1]}`;
    }
    const embed = new URL(`https://player.vimeo.com${pathname}`);
    const params = new URLSearchParams(url.search);
    params.set("autopause", "0");
    params.set("controls", "0");
    params.set("loop", "1");
    params.set("muted", "1");
    params.set("background", "1");
    params.set("autoplay", "1");
    params.set("playsinline", "1");
    embed.search = params.toString();
    return embed.toString();
  } catch {
    return src;
  }
}

function getVimeoFallbackSrc(src: string) {
  try {
    const url = new URL(src);
    const idMatch = url.pathname.match(/\/playback\/(\d+)(?:\/|$)/);
    if (!idMatch) return null;
    const embed = new URL(`https://player.vimeo.com/video/${idMatch[1]}`);
    embed.search = [
      "autopause=0",
      "controls=0",
      "loop=1",
      "muted=1",
      "background=1",
      "autoplay=1",
      "playsinline=1",
    ].join("&");
    return embed.toString();
  } catch {
    return null;
  }
}

function VideoThumb({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const fallback = getVimeoFallbackSrc(src);
  if (failed && fallback) {
    return (
      <iframe
        src={fallback}
        title=""
        allow="autoplay; fullscreen; picture-in-picture"
        className={`${className} pointer-events-none absolute inset-0 block`}
      />
    );
  }
  return (
    <video
      src={src}
      muted
      loop
      playsInline
      autoPlay
      preload="metadata"
      controls={false}
      disablePictureInPicture
      controlsList="nofullscreen nodownload noplaybackrate noremoteplayback"
      tabIndex={-1}
      onError={() => setFailed(true)}
      onClick={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      onDoubleClick={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      className={`${className} absolute inset-0 block`}
      style={{
        objectFit: "cover",
        objectPosition: "center",
        width: "100%",
        height: "100%",
        minWidth: "100%",
        minHeight: "100%",
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
}

function getCountryKey(it: AnyItem) {
  return countrySlugKey(getCountry(it));
}

function getCityKey(it: AnyItem) {
  return citySlugKey(getCity(it));
}

function getCountryKeys(it: AnyItem) {
  return uniqStrings(getCountries(it).map((value) => countrySlugKey(value)).filter(Boolean));
}

function getCityKeys(it: AnyItem) {
  return uniqStrings(getCities(it).map((value) => citySlugKey(value)).filter(Boolean));
}

function getAreaKeyFromLabel(label: string) {
  const key = slugify(label || "");
  const aliases: Record<string, string> = {
    ui: "digital",
    "ui-ux": "digital",
    "uiux": "digital",
    ux: "digital",
    package: "embalagem",
    packaging: "embalagem",
    "package-design": "embalagem",
    "pack-design": "embalagem",
    embalagens: "embalagem",
    "design-grafico": "design-grafico",
    exibicoes: "exposicoes",
    expografia: "exposicoes",
    documentary: "documental",
    "creative-coding": "programacao-criativa",
    drinks: "bebidas",
    fashion: "moda",
    travel: "viagem",
  };
  return aliases[key] || key;
}

function getCountryLabel(it: AnyItem, lang: Lang) {
  const raw = canonicalCountry(getCountry(it));
  const key = getCountryKey(it);
  return key ? getLabel(COUNTRY_LABELS, key, lang, raw) : raw;
}

function getCityLabel(it: AnyItem, lang: Lang) {
  const raw = canonicalCity(getCity(it));
  const key = getCityKey(it);
  return key ? getLabel(CITY_LABELS, key, lang, raw) : raw;
}

function getAreaLabel(label: string, lang: Lang) {
  const key = getAreaKeyFromLabel(label);
  return key ? getLabel(AREA_LABELS, key, lang, label) : label;
}

/** macro type -> padroniza (IMPORTANTE: agora pega macroType também) */
function getMacro(it: AnyItem): string {
  const raw =
    pickFirstString(it, [
      "macroType", // ✅ campo real do seu JSON/admin
      "macro",
      "macroCategory",
      "categoria",
      "tipo",
      "type",
    ]) || "";

  const v = raw.toLowerCase();

  // já padronizado:
  if (
    raw === "Studios" ||
    raw === "Photographers" ||
    raw === "Illustrators" ||
    raw === "Foundries" ||
    raw === "Designers"
  ) {
    return raw;
  }

  // singular / variações
  if (v === "studio") return "Studios";
  if (v === "designer") return "Designers";
  if (v === "photographer" || v.includes("foto")) return "Photographers";
  if (v === "illustrator" || v.includes("ilustr")) return "Illustrators";
  if (v === "foundry") return "Foundries";

  if (v.includes("found")) return "Foundries";
  if (v.includes("photo") || v.includes("fot")) return "Photographers";
  if (v.includes("illus") || v.includes("ilustr")) return "Illustrators";
  if (v.includes("designer")) return "Designers";
  if (v.includes("studio")) return "Studios";

  return raw || "Studios";
}

function getPrimaryArea(it: AnyItem) {
  return pickFirstString(it, [
    "areaPrimary",
    "primaryArea",
    "areaPrincipal",
    "áreaPrincipal",
    "area_principal",
    "AreaPrincipal",
    "Área Principal",
    "Área principal",
    "area principal",
    "mainArea",
    "area",
  ]);
}

function getSecondaryAreas(it: AnyItem) {
  return pickFirstArray(it, [
    "areasSecondary",
    "secondaryAreas",
    "areasSecundarias",
    "áreasSecundarias",
    "areas_secundarias",
    "AreasSecundarias",
    "Áreas secundárias",
    "Áreas Secundárias",
    "areas secundarias",
    "tags",
    "areas",
  ]);
}

function normalizeAreaKeys(primary: string, secondary: string[]) {
  const pKey = getAreaKeyFromLabel(primary);
  const sec = secondary
    .map((s) => getAreaKeyFromLabel(s))
    .filter(Boolean)
    .filter((s) => (pKey ? s !== pKey : true));

  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const s of sec) {
    if (!seen.has(s)) {
      seen.add(s);
      uniq.push(s);
    }
  }
  return uniq.slice(0, 4);
}

function uniqSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function normalizeSearchText(value: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeSearchQuery(query: string) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

function scoreTokenInText(
  text: string,
  token: string,
  startsWithScore: number,
  wordStartsWithScore: number,
  includesScore: number
) {
  if (!text) return 0;
  if (text === token) return startsWithScore + 15;
  if (text.startsWith(token)) return startsWithScore;
  const words = text.split(/\s+/);
  if (words.some((w) => w.startsWith(token))) return wordStartsWithScore;
  if (text.includes(token)) return includesScore;
  return 0;
}

/* ---------------- seeded shuffle ---------------- */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number) {
  const a = [...arr];
  const rnd = mulberry32(seed || 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getRandomSeed() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }
  return Math.floor(Math.random() * 1_000_000_000);
}

/* ---------------- UI constants ---------------- */
const MACRO_MENU = ["all", "Studios", "Designers", "Illustrators", "Photographers", "Foundries"];
const PIX_CODE =
  "00020126580014BR.GOV.BCB.PIX0136d52e1499-3171-46ca-aa76-e02272dc624a5204000053039865802BR5925Francysregys Rodrigues de6009SAO PAULO62140510pFvdvHdqLY6304C9A4";

function getPixQrCodeUrl() {
  const data = encodeURIComponent(PIX_CODE);
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${data}`;
}

export default function Directory({
  items,
  initialLang = "en",
}: {
  items: AnyItem[];
  initialLang?: Lang;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [q, setQ] = useState("");
  const [macroKey, setMacroKey] = useState<string>(ALL_KEY);
  const [countryKey, setCountryKey] = useState<string>(ALL_KEY);
  const [cityKey, setCityKey] = useState<string>(ALL_KEY);
  const [areaPrimaryKey, setAreaPrimaryKey] = useState<string>(ALL_KEY);
  const [areaSecondaryKey, setAreaSecondaryKey] = useState<string>(ALL_KEY);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileCollapsed, setIsMobileCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const [seed, setSeed] = useState<number | null>(null);
  const [spotlightIndex, setSpotlightIndex] = useState(0);

  const [visibleCount, setVisibleCount] = useState(10);
  const [toast, setToast] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [supportCardVisible, setSupportCardVisible] = useState(false);
  const [supportCardDismissed] = useState(false);
  const [supportMobileLockedAfterMinimize, setSupportMobileLockedAfterMinimize] = useState(false);
  const [hideSupportCardBySection, setHideSupportCardBySection] = useState(false);
  const supportSectionRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const donationViewTrackedRef = useRef(false);
  const refClicksCountRef = useRef(0);
  const loadMoreClicksCountRef = useRef(0);
  const supportTriggerRef = useRef({
    byRef: false,
    byLoadMore: false,
    bySession: false,
  });
  const searchTrackTimerRef = useRef<number | null>(null);

  const ui = UI[lang] || UI.pt;
  const hideMobileMenus = isMobile && isMobileCollapsed && !mobileMenuOpen;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("lang");
    const stored = window.localStorage.getItem("rw_lang");
    const initial = (fromUrl || stored || initialLang || "en") as Lang;
    if (initial === "pt" || initial === "en" || initial === "es") {
      setLang(initial);
    }
  }, [initialLang]);

  useEffect(() => {
    window.localStorage.setItem("rw_lang", lang);
    const params = new URLSearchParams(window.location.search);
    params.set("lang", lang);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", nextUrl);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const stored = window.localStorage.getItem("rw_theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
    } else {
      setTheme("light");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("rw_theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setIsMobileCollapsed(false);
      setMobileMenuOpen(false);
      return;
    }
    let lastY = window.scrollY;
    const onScroll = () => {
      if (searchFocused) return;
      const y = window.scrollY;
      if (y > 80 && y >= lastY) {
        setIsMobileCollapsed(true);
      } else if (y < 40) {
        setIsMobileCollapsed(false);
        setMobileMenuOpen(false);
      }
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobile, searchFocused]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!pixCopied) return;
    const timeout = window.setTimeout(() => setPixCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [pixCopied]);

  useEffect(() => {
    if (!pixModalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPixModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pixModalOpen]);

  useEffect(() => {
    if (!isMobile) return;
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleViewportResize = () => {
      const el = searchInputRef.current;
      if (!el) return;
      if (document.activeElement !== el) return;
      window.setTimeout(() => {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }, 50);
    };

    window.visualViewport.addEventListener("resize", handleViewportResize);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
    };
  }, [isMobile]);

  useEffect(() => {
    if (supportCardDismissed) return;

    const onScroll = () => {
      const supportSection = supportSectionRef.current;
      if (!supportSection) return;
      const rect = supportSection.getBoundingClientRect();
      setHideSupportCardBySection(rect.top <= window.innerHeight - 24);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [supportCardDismissed, isMobile]);

  useEffect(() => {
    if (supportCardDismissed || supportCardVisible) return;
    if (isMobile) return;

    const startedAt = Date.now();
    let cancelled = false;

    const evaluate = () => {
      if (cancelled || supportCardDismissed || supportCardVisible) return;
      const elapsed = Date.now() - startedAt;
      const deepScroll = window.scrollY > 900;
      if (elapsed >= 45000 && deepScroll) {
        if (!supportTriggerRef.current.bySession) {
          supportTriggerRef.current.bySession = true;
          sendAnalyticsEvent({ type: "donation_trigger_session", lang });
        }
        setSupportCardVisible(true);
      }
    };

    const onScroll = () => evaluate();
    const interval = window.setInterval(evaluate, 4000);
    window.addEventListener("scroll", onScroll, { passive: true });
    evaluate();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isMobile, lang, supportCardDismissed, supportCardVisible]);

  useEffect(() => {
    if (hideMobileMenus && filtersOpen) {
      setFiltersOpen(false);
    }
  }, [hideMobileMenus, filtersOpen]);

  useEffect(() => {
    setSeed(getRandomSeed());
  }, []);

  function newSeed() {
    setSeed(getRandomSeed());
    setSpotlightIndex(0);
  }

  function showToast(message: string) {
    setToast(message);
  }

  function focusSearchOnMobile() {
    if (!isMobile) return;
    setSearchFocused(true);
    setIsMobileCollapsed(false);
    setMobileMenuOpen(true);
    setFiltersOpen(true);
    const el = searchInputRef.current;
    if (!el) return;
    window.setTimeout(() => {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }, 60);
    window.setTimeout(() => {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }, 260);
  }

  async function copyPixCode() {
    sendAnalyticsEvent({ type: "donation_pix_click", lang });
    try {
      await navigator.clipboard.writeText(PIX_CODE);
      setPixCopied(true);
      sendAnalyticsEvent({ type: "pix_copy_code", lang });
    } catch {
      showToast("Não foi possível copiar");
    }
  }

  function openPixSupport() {
    if (isMobile) {
      copyPixCode();
      return;
    }
    sendAnalyticsEvent({ type: "donation_pix_modal_open", lang });
    setPixModalOpen(true);
  }

  function dismissSupportCard() {
    sendAnalyticsEvent({ type: "donation_card_minimize", lang });
    if (isMobile) {
      setSupportMobileLockedAfterMinimize(true);
    }
    setSupportCardVisible(false);
  }

  function openSupportCardBy(reason: "ref" | "load_more" | "cta") {
    if (supportCardDismissed) return;
    if (isMobile) {
      if (reason === "ref") return;
      if (reason === "load_more" && supportMobileLockedAfterMinimize) return;
    }
    if (reason === "ref" && !supportTriggerRef.current.byRef) {
      supportTriggerRef.current.byRef = true;
      sendAnalyticsEvent({ type: "donation_trigger_ref", lang });
    }
    if (reason === "load_more" && !supportTriggerRef.current.byLoadMore) {
      supportTriggerRef.current.byLoadMore = true;
      sendAnalyticsEvent({ type: "donation_trigger_load_more", lang });
    }
    if (reason === "cta") {
      sendAnalyticsEvent({ type: "donation_cta_click", lang });
      if (isMobile) setSupportMobileLockedAfterMinimize(false);
    }
    setSupportCardVisible(true);
  }

  function handleReferenceClick(name: string, url: string, macro: string) {
    trackReferenceClick(name, url, {
      lang,
      query: q.trim(),
      macro,
    });

    if (!isMobile) {
      refClicksCountRef.current += 1;
      if (refClicksCountRef.current >= 3) {
        openSupportCardBy("ref");
      }
    }
  }

  function handleClear() {
    if (!hasActiveFilters) return;
    setQ("");
    setMacroKey(ALL_KEY);
    setCountryKey(ALL_KEY);
    setCityKey(ALL_KEY);
    setAreaPrimaryKey(ALL_KEY);
    setAreaSecondaryKey(ALL_KEY);
    setVisibleCount(10);
    setSpotlightIndex(0);
    newSeed();
  }

  const hasActiveFilters =
    q.trim() !== "" ||
    macroKey !== ALL_KEY ||
    countryKey !== ALL_KEY ||
    cityKey !== ALL_KEY ||
    areaPrimaryKey !== ALL_KEY ||
    areaSecondaryKey !== ALL_KEY;

  const visibleItems = useMemo(
    () => items.filter((it) => !it.hidden),
    [items]
  );

  function handleMacroClick(value: string) {
    if (!value) return;
    sendAnalyticsEvent({ type: "filter_apply", lang, filter: "macro", value });
    setMacroKey(value);
    setVisibleCount(10);
    setSpotlightIndex(0);
    newSeed();
    setFiltersOpen(true);
  }

  function handleCountryClick(value: string) {
    if (!value) return;
    sendAnalyticsEvent({ type: "filter_apply", lang, filter: "country", value });
    setCountryKey(value);
    setVisibleCount(10);
    setSpotlightIndex(0);
    newSeed();
    setFiltersOpen(true);
  }

  function handleCityClick(value: string) {
    if (!value) return;
    sendAnalyticsEvent({ type: "filter_apply", lang, filter: "city", value });
    setCityKey(value);
    setVisibleCount(10);
    setSpotlightIndex(0);
    newSeed();
    setFiltersOpen(true);
  }

  function handleAreaPrimaryClick(value: string) {
    if (!value) return;
    sendAnalyticsEvent({ type: "filter_apply", lang, filter: "area_primary", value });
    setAreaPrimaryKey(value);
    setVisibleCount(10);
    setSpotlightIndex(0);
    setFiltersOpen(true);
  }

  function handleAreaSecondaryClick(value: string) {
    if (!value) return;
    sendAnalyticsEvent({ type: "filter_apply", lang, filter: "area_secondary", value });
    setAreaSecondaryKey(value);
    setVisibleCount(10);
    setSpotlightIndex(0);
    setFiltersOpen(true);
  }

  /* -------- options -------- */
  const macroOptions = useMemo(() => {
    const values = uniqSorted(visibleItems.map(getMacro).filter(Boolean));
    const list = values.map((value) => ({
      key: value,
      label: getMacroLabel(value, lang),
    }));
    list.sort((a, b) => a.label.localeCompare(b.label));
    return [{ key: ALL_KEY, label: ui.all }, ...list];
  }, [visibleItems, lang, ui.all]);

  const countryOptions = useMemo(() => {
    const keys = new Set<string>();
    const samples = new Map<string, string>();
    for (const it of visibleItems) {
      if (macroKey !== ALL_KEY && getMacro(it) !== macroKey) continue;
      for (const country of getCountries(it)) {
        const key = countrySlugKey(country);
        if (!key) continue;
        keys.add(key);
        if (!samples.has(key)) samples.set(key, country);
      }
    }
    const list = Array.from(keys).map((key) => ({
      key,
      label: getLabel(COUNTRY_LABELS, key, lang, samples.get(key)) || "",
    }));
    list.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return [{ key: ALL_KEY, label: ui.all }, ...list];
  }, [visibleItems, macroKey, lang, ui.all]);

  const cityOptions = useMemo(() => {
    const keys = new Set<string>();
    const samples = new Map<string, string>();
    for (const it of visibleItems) {
      if (macroKey !== ALL_KEY && getMacro(it) !== macroKey) continue;
      if (countryKey !== ALL_KEY && !getCountryKeys(it).includes(countryKey)) continue;
      for (const city of getCities(it)) {
        const key = citySlugKey(city);
        if (!key) continue;
        keys.add(key);
        if (!samples.has(key)) samples.set(key, city);
      }
    }
    const list = Array.from(keys).map((key) => ({
      key,
      label: getLabel(CITY_LABELS, key, lang, samples.get(key)) || "",
    }));
    list.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return [{ key: ALL_KEY, label: ui.all }, ...list];
  }, [visibleItems, macroKey, countryKey, lang, ui.all]);

  const areaPrimaryOptions = useMemo(() => {
    const keys = new Set<string>();
    const samples = new Map<string, string>();
    for (const it of visibleItems) {
      if (macroKey !== ALL_KEY && getMacro(it) !== macroKey) continue;
      if (countryKey !== ALL_KEY && !getCountryKeys(it).includes(countryKey)) continue;
      if (cityKey !== ALL_KEY && !getCityKeys(it).includes(cityKey)) continue;
      const raw = getPrimaryArea(it);
      const key = getAreaKeyFromLabel(raw);
      if (key) {
        keys.add(key);
        if (!samples.has(key)) samples.set(key, raw);
      }
    }
    const list = Array.from(keys).map((key) => ({
      key,
      label: getLabel(AREA_LABELS, key, lang, samples.get(key)) || "",
    }));
    list.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return [{ key: ALL_KEY, label: ui.all }, ...list];
  }, [visibleItems, macroKey, countryKey, cityKey, lang, ui.all]);

  const areaSecondaryOptions = useMemo(() => {
    const keys = new Set<string>();
    const samples = new Map<string, string>();
    for (const it of visibleItems) {
      if (macroKey !== ALL_KEY && getMacro(it) !== macroKey) continue;
      if (countryKey !== ALL_KEY && !getCountryKeys(it).includes(countryKey)) continue;
      if (cityKey !== ALL_KEY && !getCityKeys(it).includes(cityKey)) continue;
      for (const area of getSecondaryAreas(it)) {
        const key = getAreaKeyFromLabel(area);
        if (key) {
          keys.add(key);
          if (!samples.has(key)) samples.set(key, area);
        }
      }
    }
    const list = Array.from(keys).map((key) => ({
      key,
      label: getLabel(AREA_LABELS, key, lang, samples.get(key)) || "",
    }));
    list.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return [{ key: ALL_KEY, label: ui.all }, ...list];
  }, [visibleItems, macroKey, countryKey, cityKey, lang, ui.all]);

  useEffect(() => {
    if (cityKey !== ALL_KEY && !cityOptions.some((o) => o.key === cityKey)) setCityKey(ALL_KEY);
    if (areaPrimaryKey !== ALL_KEY && !areaPrimaryOptions.some((o) => o.key === areaPrimaryKey))
      setAreaPrimaryKey(ALL_KEY);
    if (areaSecondaryKey !== ALL_KEY && !areaSecondaryOptions.some((o) => o.key === areaSecondaryKey))
      setAreaSecondaryKey(ALL_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryKey, macroKey]);

  /* -------- filtering -------- */
  const filtered = useMemo(() => {
    const queryTokens = tokenizeSearchQuery(q);
    const normalizedQuery = normalizeSearchText(q);
    const hasPrimaryAreaPriority = areaPrimaryKey !== ALL_KEY;

    const base = visibleItems.filter((it) => {
      const m = getMacro(it);
      const ctryKeys = getCountryKeys(it);
      const ctyKeys = getCityKeys(it);
      const pArea = getPrimaryArea(it);
      const sAreas = getSecondaryAreas(it);
      const pAreaKey = getAreaKeyFromLabel(pArea);
      const sAreaKeys = sAreas.map((s) => getAreaKeyFromLabel(s)).filter(Boolean);

      if (macroKey !== ALL_KEY && m !== macroKey) return false;
      if (countryKey !== ALL_KEY && !ctryKeys.includes(countryKey)) return false;
      if (cityKey !== ALL_KEY && !ctyKeys.includes(cityKey)) return false;

      if (
        areaPrimaryKey !== ALL_KEY &&
        !(pAreaKey === areaPrimaryKey || sAreaKeys.includes(areaPrimaryKey))
      )
        return false;
      if (
        areaSecondaryKey !== ALL_KEY &&
        !(sAreaKeys.includes(areaSecondaryKey) || pAreaKey === areaSecondaryKey)
      )
        return false;

      return true;
    });

    if (!queryTokens.length) {
      if (!hasPrimaryAreaPriority) return base;
      return [...base].sort((a, b) => {
        const aPrimary = getAreaKeyFromLabel(getPrimaryArea(a)) === areaPrimaryKey ? 1 : 0;
        const bPrimary = getAreaKeyFromLabel(getPrimaryArea(b)) === areaPrimaryKey ? 1 : 0;
        if (aPrimary !== bPrimary) return bPrimary - aPrimary;
        return getName(a).localeCompare(getName(b));
      });
    }

    const ranked = base
      .map((it) => {
        const name = normalizeSearchText(getName(it));
        const url = normalizeSearchText(getUrl(it));
        const macro = normalizeSearchText(getMacro(it));
        const country = normalizeSearchText(getCountries(it).join(" "));
        const city = normalizeSearchText(getCities(it).join(" "));
        const countryLabel = normalizeSearchText(
          getCountries(it)
            .map((value) => getLabel(COUNTRY_LABELS, countrySlugKey(value), lang, value))
            .join(" ")
        );
        const cityLabel = normalizeSearchText(
          getCities(it)
            .map((value) => getLabel(CITY_LABELS, citySlugKey(value), lang, value))
            .join(" ")
        );
        const primaryAreaRaw = getPrimaryArea(it);
        const secondaryAreasRaw = getSecondaryAreas(it);
        const areaRaw = normalizeSearchText([primaryAreaRaw, ...secondaryAreasRaw].join(" "));
        const areaLabel = normalizeSearchText(
          [
            getAreaLabel(primaryAreaRaw, lang),
            ...secondaryAreasRaw.map((s) => getAreaLabel(s, lang)),
          ].join(" ")
        );

        let score = 0;
        for (const token of queryTokens) {
          const tokenScore = Math.max(
            scoreTokenInText(name, token, 140, 120, 95),
            scoreTokenInText(url, token, 110, 95, 70),
            scoreTokenInText(country, token, 48, 42, 35),
            scoreTokenInText(city, token, 48, 42, 35),
            scoreTokenInText(countryLabel, token, 44, 38, 30),
            scoreTokenInText(cityLabel, token, 44, 38, 30),
            scoreTokenInText(areaRaw, token, 38, 34, 26),
            scoreTokenInText(areaLabel, token, 34, 30, 22),
            scoreTokenInText(macro, token, 32, 28, 20)
          );
          if (!tokenScore) return null;
          score += tokenScore;
        }

        if (normalizedQuery && name.includes(normalizedQuery)) score += 90;
        if (normalizedQuery && url.includes(normalizedQuery)) score += 45;
        if (hasPrimaryAreaPriority) {
          const primaryMatch = getAreaKeyFromLabel(primaryAreaRaw) === areaPrimaryKey;
          const secondaryMatch = secondaryAreasRaw
            .map((s) => getAreaKeyFromLabel(s))
            .includes(areaPrimaryKey);
          if (primaryMatch) score += 30;
          else if (secondaryMatch) score += 10;
        }

        return { it, score };
      })
      .filter((entry): entry is { it: AnyItem; score: number } => Boolean(entry))
      .sort((a, b) => b.score - a.score || getName(a.it).localeCompare(getName(b.it)));

    return ranked.map((entry) => entry.it);
  }, [visibleItems, q, macroKey, countryKey, cityKey, areaPrimaryKey, areaSecondaryKey, lang]);

  const ordered = useMemo(() => {
    if (tokenizeSearchQuery(q).length) return filtered;
    if (areaPrimaryKey !== ALL_KEY) {
      if (!seed) return filtered;
      const primaryMatches: AnyItem[] = [];
      const secondaryMatches: AnyItem[] = [];

      for (const it of filtered) {
        const pKey = getAreaKeyFromLabel(getPrimaryArea(it));
        if (pKey === areaPrimaryKey) {
          primaryMatches.push(it);
          continue;
        }
        const sKeys = getSecondaryAreas(it).map((s) => getAreaKeyFromLabel(s));
        if (sKeys.includes(areaPrimaryKey)) {
          secondaryMatches.push(it);
          continue;
        }
      }

      return [
        ...seededShuffle(primaryMatches, seed),
        ...seededShuffle(secondaryMatches, seed + 1),
      ];
    }
    if (!seed) return filtered;
    return seededShuffle(filtered, seed);
  }, [filtered, seed, q, areaPrimaryKey]);

  const total = ordered.length;

  useEffect(() => {
    const query = q.trim();
    if (!query || query.length < 2) return;
    if (searchTrackTimerRef.current) {
      window.clearTimeout(searchTrackTimerRef.current);
    }
    searchTrackTimerRef.current = window.setTimeout(() => {
      sendAnalyticsEvent({
        type: "search",
        lang,
        query,
        results: total,
      });
      searchTrackTimerRef.current = null;
    }, 700);
    return () => {
      if (searchTrackTimerRef.current) {
        window.clearTimeout(searchTrackTimerRef.current);
        searchTrackTimerRef.current = null;
      }
    };
  }, [q, total, lang]);

  useEffect(() => {
    if (!supportCardVisible || donationViewTrackedRef.current) return;
    donationViewTrackedRef.current = true;
    sendAnalyticsEvent({ type: "donation_card_view", lang });
  }, [supportCardVisible, lang]);

  useEffect(() => {
    setSpotlightIndex(0);
  }, [q, macroKey, countryKey, cityKey, areaPrimaryKey, areaSecondaryKey, seed]);

  const spotlight = total ? ordered[Math.min(spotlightIndex, total - 1)] : null;

  const gridItems = useMemo(() => {
    if (!total) return [];
    const idx = Math.min(spotlightIndex, total - 1);
    const arr = ordered.filter((_, i) => i !== idx);
    return arr.slice(0, visibleCount);
  }, [ordered, spotlightIndex, total, visibleCount]);

  if (seed === null) {
    return (
      <div className="mx-auto w-full px-6 pb-14 pt-10 sm:px-10 lg:px-12">
        <div className="h-24 border-b border-zinc-200" />
        <div className="pt-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.25fr_1fr]">
            <div className="aspect-[16/9] w-full bg-zinc-100" />
            <div className="h-40 bg-zinc-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full px-6 pb-14 pt-10 sm:px-10 lg:px-12">
      {/* Topo */}
      <header
        className={[
          "sticky top-0 z-40 border-b backdrop-blur",
          theme === "dark" ? "border-zinc-800 bg-zinc-950/80" : "border-zinc-200 bg-white/80",
          "transition-[padding] duration-200",
          hideMobileMenus ? "pb-2 pt-3" : "pb-10 pt-4",
        ].join(" ")}
      >
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[360px_1fr_260px] lg:items-start lg:gap-8">
          <div className={hideMobileMenus ? "space-y-0" : "space-y-6"}>
            <div className="flex items-center justify-between">
              <div className="instrument-serif-regular text-[44px] leading-none tracking-[-0.01em] sm:text-[52px]">
                referencias.work
              </div>
              {isMobile && isMobileCollapsed ? (
                <button
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="instrument-serif-regular text-[44px] leading-none tracking-[-0.01em] sm:text-[52px]"
                  aria-expanded={!hideMobileMenus}
                  aria-label="Mostrar menu"
                >
                  {mobileMenuOpen ? "—" : "+"}
                </button>
              ) : null}
            </div>
          </div>

          {/* menu macro */}
          <div
            className={[
              "flex justify-start lg:justify-center transition-all duration-300",
              hideMobileMenus
                ? "pointer-events-none max-h-0 opacity-0 mt-0"
                : "max-h-40 opacity-100 mt-6 lg:mt-0",
            ].join(" ")}
          >
            <nav className="pt-2 text-[16px]">
              {MACRO_MENU.map((value, idx) => {
                const active = macroKey === value || (value === "all" && macroKey === ALL_KEY);
                const label = value === "all" ? ui.macros.all : getMacroLabel(value, lang);
                return (
                    <span key={value}>
                      <button
                        onClick={() => {
                          const nextValue =
                            value === "all"
                              ? ALL_KEY
                              : macroKey === value
                              ? ALL_KEY
                              : value;
                          sendAnalyticsEvent({
                            type: "filter_apply",
                            lang,
                            filter: "macro",
                            value: nextValue,
                          });
                          if (value === "all") {
                            setMacroKey(ALL_KEY);
                          } else {
                            setMacroKey((cur) => (cur === value ? ALL_KEY : value));
                          }
                          setVisibleCount(10);
                          setSpotlightIndex(0);
                          newSeed();
                        }}
                        className={active ? "text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}
                      >
                        {label}
                      </button>
                      {idx < MACRO_MENU.length - 1 ? <span className="text-zinc-400">, </span> : null}
                    </span>
                );
              })}
            </nav>
          </div>

          {/* idioma + filtros */}
          <div
            className={[
              "flex items-center justify-between gap-6 lg:justify-end transition-all duration-300 flex-nowrap",
              hideMobileMenus
                ? "pointer-events-none max-h-0 opacity-0 mt-0"
                : "max-h-40 opacity-100 mt-4 lg:mt-0",
            ].join(" ")}
          >
            <Link
              href={`/sobre?lang=${lang}`}
              className="pt-2 text-[14px] sm:text-[16px] whitespace-nowrap text-zinc-400 hover:text-zinc-700"
            >
              {lang === "en" ? "About" : "Sobre"}
            </Link>

            <div className="pt-2 text-[14px] sm:text-[16px] whitespace-nowrap">
              {(["pt", "es", "en"] as Lang[]).map((code, idx) => (
                <span key={code}>
                  <button
                    onClick={() => setLang(code)}
                    className={lang === code ? "text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}
                  >
                    {code}
                  </button>
                  {idx < 2 ? <span className="text-zinc-400">/</span> : null}
                </span>
              ))}
            </div>

            <div className="inline-flex items-center gap-0 pt-2 text-[14px] sm:text-[16px] shrink-0">
              <button
                onClick={() => setTheme("light")}
                className={theme === "light" ? "text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}
                aria-pressed={theme === "light"}
              >
                Light
              </button>
              <span className="text-zinc-400">/</span>
              <button
                onClick={() => setTheme("dark")}
                className={theme === "dark" ? "text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}
                aria-pressed={theme === "dark"}
              >
                Dark
              </button>
            </div>

            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="inline-flex whitespace-nowrap pt-2 text-[14px] sm:text-[16px] text-zinc-950 shrink-0"
              aria-expanded={filtersOpen}
            >
              {filtersOpen ? `- ${ui.filters.toggle}` : `+ ${ui.filters.toggle}`}
            </button>
          </div>
        </div>
      </header>

      {/* filtros */}
      <div
        className={[
          "z-30 overflow-hidden border-b backdrop-blur transition-[max-height,opacity,padding] duration-300 lg:sticky lg:top-[84px]",
          theme === "dark" ? "border-zinc-800 bg-zinc-950/85" : "border-zinc-200 bg-white/85",
          filtersOpen ? "max-h-[520px] pb-6 pt-8 opacity-100" : "max-h-0 pb-0 pt-0 opacity-0",
        ].join(" ")}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_1fr_auto] lg:items-end">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.search}
            </div>
            <input
              ref={searchInputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={focusSearchOnMobile}
              onBlur={() => setSearchFocused(false)}
              placeholder={ui.filters.search.toLowerCase()}
              className="mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none placeholder:text-zinc-400"
            />
          </div>

          {!isMobile ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.category}
            </div>
            <select
              value={macroKey}
              onChange={(e) => {
                sendAnalyticsEvent({
                  type: "filter_apply",
                  lang,
                  filter: "macro",
                  value: e.target.value,
                });
                setMacroKey(e.target.value);
                setVisibleCount(10);
                setSpotlightIndex(0);
                newSeed();
              }}
              className="rw-filter-select mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none"
            >
              {macroOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          ) : null}

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.areaPrimary}
            </div>
            <select
              value={areaPrimaryKey}
              onChange={(e) => {
                sendAnalyticsEvent({
                  type: "filter_apply",
                  lang,
                  filter: "area_primary",
                  value: e.target.value,
                });
                setAreaPrimaryKey(e.target.value);
                setVisibleCount(10);
                setSpotlightIndex(0);
              }}
              className="rw-filter-select mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none"
            >
              {areaPrimaryOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {!isMobile ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.areaSecondary}
            </div>
            <select
              value={areaSecondaryKey}
              onChange={(e) => {
                sendAnalyticsEvent({
                  type: "filter_apply",
                  lang,
                  filter: "area_secondary",
                  value: e.target.value,
                });
                setAreaSecondaryKey(e.target.value);
                setVisibleCount(10);
                setSpotlightIndex(0);
              }}
              className="rw-filter-select mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none"
            >
              {areaSecondaryOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          ) : null}

          {!isMobile ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.country}
            </div>
            <select
              value={countryKey}
              onChange={(e) => {
                sendAnalyticsEvent({
                  type: "filter_apply",
                  lang,
                  filter: "country",
                  value: e.target.value,
                });
                setCountryKey(e.target.value);
                setVisibleCount(10);
                setSpotlightIndex(0);
                newSeed();
              }}
              className="rw-filter-select mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none"
            >
              {countryOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          ) : null}

          {!isMobile ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.city}
            </div>
            <select
              value={cityKey}
              onChange={(e) => {
                sendAnalyticsEvent({
                  type: "filter_apply",
                  lang,
                  filter: "city",
                  value: e.target.value,
                });
                setCityKey(e.target.value);
                setVisibleCount(10);
                setSpotlightIndex(0);
                newSeed();
              }}
              className="rw-filter-select mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none"
            >
              {cityOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 lg:justify-end">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
              {total} {ui.filters.results}
            </div>

            <button
              onClick={handleClear}
              disabled={!hasActiveFilters}
              className={[
                "btn px-4 py-2 text-[16px] tracking-[0.02em]",
                hasActiveFilters
                  ? "cursor-pointer"
                  : "cursor-not-allowed text-zinc-400 opacity-60",
              ].join(" ")}
            >
              {ui.filters.clear}
            </button>
          </div>
        </div>
      </div>

      {/* Spotlight */}
      {spotlight && (
        <div className="pt-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-start">
            <div className="border border-zinc-200">
              <div className="aspect-[16/9] w-full overflow-hidden bg-zinc-100 relative">
                {getThumb(spotlight) ? (
                    isVideoUrl(getThumb(spotlight)) ? (
                    <VideoThumb src={getThumb(spotlight)} className="h-full w-full object-cover" />
                  ) : isVimeoUrl(getThumb(spotlight)) ? (
                    <iframe
                      src={getVimeoEmbedSrc(getThumb(spotlight))}
                      title=""
                      allow="autoplay; fullscreen; picture-in-picture"
                      className="h-full w-full pointer-events-none absolute inset-0"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={getThumb(spotlight)} alt="" className="h-full w-full object-cover" />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                    {ui.noImage}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                {ui.spotlight}
              </div>

              <div className="mt-3 text-[56px] leading-[0.95] tracking-[-0.02em]">{getName(spotlight)}</div>

              <div className="mt-4 text-[16px] tracking-[0.02em]">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleMacroClick(getMacro(spotlight))}
                    className="cursor-pointer text-zinc-900 underline decoration-zinc-900/40 underline-offset-4 hover:decoration-zinc-900"
                  >
                    {getMacroLabel(getMacro(spotlight), lang)}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleCountryClick(getCountryKey(spotlight))}
                    className="cursor-pointer text-zinc-600 underline decoration-zinc-400/40 underline-offset-4 hover:decoration-zinc-500"
                  >
                    {getCountryLabel(spotlight, lang) || "—"}
                  </button>
                  <button
                    onClick={() => handleCityClick(getCityKey(spotlight))}
                    className="cursor-pointer text-zinc-600 underline decoration-zinc-400/40 underline-offset-4 hover:decoration-zinc-500"
                  >
                    {getCityLabel(spotlight, lang) || "—"}
                  </button>
                  {getAdditionalLocationCount(spotlight) > 0 ? (
                    <span className="text-[12px] text-zinc-500">+{getAdditionalLocationCount(spotlight)}</span>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 text-[16px] text-zinc-700">
                {(() => {
                  const p = getPrimaryArea(spotlight);
                  const s = normalizeAreaKeys(p, getSecondaryAreas(spotlight));
                  return { p, s };
                })().p && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleAreaPrimaryClick(getAreaKeyFromLabel(getPrimaryArea(spotlight)))}
                      className="cursor-pointer underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-600"
                    >
                      {getAreaLabel(getPrimaryArea(spotlight), lang)}
                    </button>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(() => {
                    const p = getPrimaryArea(spotlight);
                    const s = normalizeAreaKeys(p, getSecondaryAreas(spotlight));
                    return s;
                  })().map((t) => (
                    <button
                      key={t}
                      onClick={() => handleAreaSecondaryClick(t)}
                      className="cursor-pointer text-zinc-600 underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-600"
                    >
                      {getLabel(AREA_LABELS, t, lang)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex items-center">
                <a
                  href={getUrl(spotlight)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    handleReferenceClick(getName(spotlight), getUrl(spotlight), getMacro(spotlight))
                  }
                  className="btn cursor-pointer px-5 py-2 text-[16px] tracking-[0.02em]"
                >
                  {ui.visit}
                </a>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Grid */}
      <div className="pt-10">
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {gridItems.map((it, idx) => {
            const name = getName(it);
            const url = getUrl(it);
            const m = getMacro(it);
            const p = getPrimaryArea(it);
            const s = normalizeAreaKeys(p, getSecondaryAreas(it));
            const thumb = getThumb(it);

            return (
              <a
                key={asStr(it.id) || `${name}-${idx}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  handleReferenceClick(name, url, m)
                }
                className="group min-w-0 border border-zinc-200 bg-white"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-100 relative">
                  {thumb ? (
                    isVideoUrl(thumb) ? (
                      <VideoThumb
                        src={thumb}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : isVimeoUrl(thumb) ? (
                      <iframe
                        src={getVimeoEmbedSrc(thumb)}
                        title=""
                        allow="autoplay; fullscreen; picture-in-picture"
                        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={{
                          width: "133.33%",
                          height: "100%",
                          minWidth: "100%",
                          minHeight: "100%",
                        }}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                      {ui.noImage}
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[22px] leading-snug">{name}</div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleMacroClick(m);
                      }}
                      className="border border-zinc-300 px-3 py-2 text-[12px] text-zinc-500 tracking-normal"
                    >
                      {getMacroLabel(m, lang)}
                    </button>
                  </div>

                  <div className="mt-3 text-[16px] text-zinc-600 tracking-normal">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleCountryClick(getCountryKey(it));
                      }}
                      className="cursor-pointer underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-600"
                    >
                      {getCountryLabel(it, lang) || "—"}
                    </button>
                    <span className="mx-2 text-zinc-300">•</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleCityClick(getCityKey(it));
                      }}
                      className="cursor-pointer underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-600"
                    >
                      {getCityLabel(it, lang) || "—"}
                    </button>
                    {getAdditionalLocationCount(it) > 0 ? (
                      <span className="ml-1 text-[12px] text-zinc-500">+{getAdditionalLocationCount(it)}</span>
                    ) : null}
                  </div>

                  <div className="my-4 h-px w-full bg-zinc-200" />

                  <div className="text-[16px] text-zinc-700 tracking-normal">
                    {p ? (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleAreaPrimaryClick(getAreaKeyFromLabel(p));
                        }}
                        className="cursor-pointer underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-700"
                      >
                        {getAreaLabel(p, lang)}
                      </button>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </div>

                  {!!s.length && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[16px] text-zinc-500 tracking-normal">
                      {s.map((t) => (
                        <button
                          key={t}
                          onClick={(e) => {
                            e.preventDefault();
                            handleAreaSecondaryClick(t);
                          }}
                          className="cursor-pointer underline decoration-zinc-300/60 underline-offset-4 hover:decoration-zinc-500"
                        >
                          {getLabel(AREA_LABELS, t, lang)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </a>
            );
          })}
        </div>

        {visibleCount < Math.max(0, total - 1) && (
          <div className="flex justify-center pt-10">
            <button
              onClick={() => {
                sendAnalyticsEvent({
                  type: "load_more_click",
                  lang,
                  value: String(visibleCount),
                });
                setVisibleCount((n) => Math.min(n + 5, Math.max(0, total - 1)));
                if (isMobile) {
                  openSupportCardBy("load_more");
                } else {
                  loadMoreClicksCountRef.current += 1;
                  if (loadMoreClicksCountRef.current >= 2) openSupportCardBy("load_more");
                }
              }}
              className="btn cursor-pointer px-6 py-3 text-[16px] tracking-[0.02em]"
            >
              {ui.loadMore}
            </button>
          </div>
        )}
      </div>

      <section ref={supportSectionRef} className="mt-16 border-t border-zinc-200 pt-8">
        <div className="flex flex-col gap-6">
          <h2 className="mx-auto max-w-[560px] text-center text-[22px] leading-snug text-zinc-900">
            {lang === "en" ? (
              <>
                Did the references help you?
                <br />
                Consider contributing to the project.
              </>
            ) : lang === "es" ? (
              <>
                ¿Te han sido útiles las referencias?
                <br />
                Considera la posibilidad de contribuir al proyecto.
              </>
            ) : (
              <>
                As referências te ajudaram?
                <br />
                Este acervo é independente. Sua contribuição mantém a curadoria ativa.
              </>
            )}
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-6 border-t border-zinc-200 pt-6 sm:grid-cols-2 sm:gap-10 sm:border-t-0 sm:pt-0">
            <div className="flex flex-col items-center gap-4 sm:border-r sm:border-zinc-200 sm:pr-10">
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-900">Em reais via pix</div>
              <button
                onClick={openPixSupport}
                className="btn cursor-pointer px-5 py-2 text-[16px] tracking-[0.02em]"
              >
                {isMobile ? (pixCopied ? "Código copiado" : "Copiar código Pix") : "Abrir QR Code Pix"}
              </button>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-900">
                {lang === "es" ? "en USD a través de PayPal" : "In USD via PayPal"}
              </div>
              <form action="https://www.paypal.com/donate" method="post" target="_top">
                <input type="hidden" name="hosted_button_id" value="E9XXLCKPSMR3E" />
                <button
                  type="submit"
                  onClick={() => sendAnalyticsEvent({ type: "donation_paypal_click", lang })}
                  className="btn cursor-pointer px-5 py-2 text-[16px] tracking-[0.02em]"
                >
                  {lang === "es" ? "Donar" : "Donate"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-16 border-t border-zinc-200 pt-6">
        <div className="flex flex-col gap-4 text-[14px] text-zinc-600 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {lang === "en"
              ? "Project developed by Regys Lima"
              : lang === "es"
              ? "Proyecto desarrollado por Regys Lima"
              : "Projeto desenvolvido por Regys Lima"}
          </div>
          <div className="text-zinc-600">
            <a
              href="https://regys.design/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-600"
            >
              {lang === "en" ? "Portfolio" : lang === "es" ? "Portafolio" : "Portfólio"}
            </a>
            <span className="text-zinc-400">, </span>
            <a
              href="https://www.instagram.com/_regyslima/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-600"
            >
              Instagram
            </a>
            <span className="text-zinc-400">, </span>
            <a
              href="https://www.linkedin.com/in/regyslima/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-600"
            >
              {lang === "en" ? "LinkedIn" : lang === "es" ? "Linkedin" : "Linkedin"}
            </a>
            <span className="text-zinc-400">, </span>
            <a
              href="mailto:regyslima07@gmail.com"
              className="underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-600"
            >
              {lang === "en" ? "Contact" : lang === "es" ? "Contacto" : "Contato"}
            </a>
          </div>
        </div>
      </footer>

      {toast ? (
        <div
          className={[
            "fixed bottom-5 left-5 z-50 rounded-full border px-4 py-2 text-[14px] shadow-sm",
            theme === "dark"
              ? "border-zinc-700 bg-zinc-950 text-zinc-100"
              : "border-zinc-200 bg-white text-zinc-900",
          ].join(" ")}
        >
          {toast}
        </div>
      ) : null}

      {!supportCardDismissed && !supportCardVisible && !hideSupportCardBySection ? (
        <button
          type="button"
          onClick={() => openSupportCardBy("cta")}
          className={[
            "fixed bottom-5 right-5 z-40 border px-4 py-2 text-sm shadow-sm backdrop-blur transition lg:text-[15px]",
            theme === "dark"
              ? "border-zinc-500 bg-zinc-950/90 text-zinc-100 hover:border-zinc-200"
              : "border-zinc-300 bg-white/95 text-zinc-900 hover:border-zinc-900",
          ].join(" ")}
        >
          {lang === "en" ? "Support project" : lang === "es" ? "Apoyar proyecto" : "Apoiar projeto"}
        </button>
      ) : null}

      {!supportCardDismissed && supportCardVisible && !hideSupportCardBySection ? (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,390px)] -translate-x-1/2 lg:bottom-5 lg:left-auto lg:right-5 lg:w-[390px] lg:translate-x-0">
          <div
            className={[
              "rounded-none border p-5 shadow-lg backdrop-blur transition-all",
              theme === "dark"
                ? "border-zinc-300/70 bg-white/85 text-[#111111]"
                : "border-zinc-700/80 bg-zinc-950/85 text-[#f5f5f5]",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div
                  className={[
                    "text-xs uppercase tracking-[0.2em]",
                    theme === "dark" ? "text-[#3f3f46]" : "text-zinc-300",
                  ].join(" ")}
                >
                  {lang === "en" ? "Support" : lang === "es" ? "Apoyo" : "Apoio"}
                </div>
                <div className="mt-1 text-base leading-snug">
                  {lang === "en"
                    ? "This archive is independent. Your contribution keeps the curation active."
                    : lang === "es"
                    ? "Este acervo es independiente. Tu contribución mantiene la curaduría activa."
                    : "Este acervo é independente. Sua contribuição mantém a curadoria ativa."}
                </div>
              </div>
              <button
                onClick={dismissSupportCard}
                className={[
                  "inline-flex h-7 w-7 items-center justify-center border text-lg leading-none",
                  theme === "dark"
                    ? "border-zinc-400/60 text-[#3f3f46] hover:border-[#111111] hover:text-[#111111]"
                    : "border-zinc-400/50 text-zinc-300 hover:border-zinc-100 hover:text-zinc-100",
                ].join(" ")}
                aria-label="Minimizar card de apoio"
                title="Minimizar"
              >
                −
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={openPixSupport}
                  className={[
                    "cursor-pointer rounded-none border px-4 py-3 text-base tracking-[0.02em] transition",
                    theme === "dark"
                      ? "border-zinc-300 bg-[#ffffff] text-[#111111] hover:bg-[#f3f4f6]"
                      : "border-zinc-500 bg-zinc-50 text-zinc-950 hover:bg-white",
                  ].join(" ")}
                >
                  {isMobile ? (pixCopied ? "Pix copiado ✓" : "Pix") : "Pix QR"}
                </button>
                <form action="https://www.paypal.com/donate" method="post" target="_top">
                  <input type="hidden" name="hosted_button_id" value="E9XXLCKPSMR3E" />
                  <button
                    type="submit"
                    onClick={() => sendAnalyticsEvent({ type: "donation_paypal_click", lang })}
                    className={[
                      "w-full cursor-pointer rounded-none border px-4 py-3 text-base tracking-[0.02em] transition",
                      theme === "dark"
                        ? "border-zinc-300 bg-[#ffffff] text-[#111111] hover:bg-[#f3f4f6]"
                        : "border-zinc-500 bg-zinc-50 text-zinc-950 hover:bg-white",
                    ].join(" ")}
                  >
                    PayPal
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pixModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4"
          onClick={() => setPixModalOpen(false)}
        >
          <div
            className="w-full max-w-[420px] border border-zinc-800 bg-zinc-950 p-5 text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">Pix</div>
                <div className="mt-1 text-base">
                  {lang === "en"
                    ? "Scan the QR code or copy the Pix code."
                    : lang === "es"
                    ? "Escanea el QR o copia el código Pix."
                    : "Escaneie o QR code ou copie o código Pix."}
                </div>
              </div>
              <button
                onClick={() => setPixModalOpen(false)}
                className="border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-400 hover:text-zinc-100"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 border border-zinc-800 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getPixQrCodeUrl()} alt="QR Code Pix" className="h-auto w-full" />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={copyPixCode}
                className="border border-zinc-500 bg-zinc-100 px-4 py-2 text-sm text-zinc-950 hover:bg-white"
              >
                {pixCopied ? "Código copiado ✓" : "Copiar código Pix"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
