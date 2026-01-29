"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const raw = pickFirstString(it, ["country", "pais", "país"]);
  return raw.replace(/<[^>]+>/g, "").trim();
}

function getCity(it: AnyItem) {
  const raw = pickFirstString(it, ["city", "cidade"]);
  return raw.replace(/<[^>]+>/g, "").trim();
}

function getThumb(it: AnyItem) {
  return pickFirstString(it, ["thumbnailUrl", "thumb", "image", "cover", "thumbUrl", "thumbnail"]);
}

function getCountryKey(it: AnyItem) {
  return slugify(getCountry(it));
}

function getCityKey(it: AnyItem) {
  return slugify(getCity(it));
}

function getAreaKeyFromLabel(label: string) {
  return slugify(label || "");
}

function getCountryLabel(it: AnyItem, lang: Lang) {
  const raw = getCountry(it);
  const key = getCountryKey(it);
  return key ? getLabel(COUNTRY_LABELS, key, lang, raw) : raw;
}

function getCityLabel(it: AnyItem, lang: Lang) {
  const raw = getCity(it);
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

export default function Directory({ items }: { items: AnyItem[] }) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [lang, setLang] = useState<Lang>("pt");
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

  const [seed, setSeed] = useState<number | null>(null);
  const [spotlightIndex, setSpotlightIndex] = useState(0);

  const [visibleCount, setVisibleCount] = useState(20);
  const [toast, setToast] = useState<string | null>(null);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const ui = UI[lang] || UI.pt;
  const hideMobileMenus = isMobile && isMobileCollapsed && !mobileMenuOpen;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("lang");
    const stored = window.localStorage.getItem("rw_lang");
    const initial = (fromUrl || stored || "pt") as Lang;
    if (initial === "pt" || initial === "en" || initial === "es") {
      setLang(initial);
    }
  }, []);

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
  }, [isMobile]);

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

  function handleClear() {
    if (!hasActiveFilters) return;
    setQ("");
    setMacroKey(ALL_KEY);
    setCountryKey(ALL_KEY);
    setCityKey(ALL_KEY);
    setAreaPrimaryKey(ALL_KEY);
    setAreaSecondaryKey(ALL_KEY);
    setVisibleCount(20);
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

  function handleMacroClick(value: string) {
    if (!value) return;
    setMacroKey(value);
    setVisibleCount(20);
    setSpotlightIndex(0);
    newSeed();
    setFiltersOpen(true);
  }

  function handleCountryClick(value: string) {
    if (!value) return;
    setCountryKey(value);
    setVisibleCount(20);
    setSpotlightIndex(0);
    newSeed();
    setFiltersOpen(true);
  }

  function handleCityClick(value: string) {
    if (!value) return;
    setCityKey(value);
    setVisibleCount(20);
    setSpotlightIndex(0);
    newSeed();
    setFiltersOpen(true);
  }

  function handleAreaPrimaryClick(value: string) {
    if (!value) return;
    setAreaPrimaryKey(value);
    setVisibleCount(20);
    setSpotlightIndex(0);
    setFiltersOpen(true);
  }

  function handleAreaSecondaryClick(value: string) {
    if (!value) return;
    setAreaSecondaryKey(value);
    setVisibleCount(20);
    setSpotlightIndex(0);
    setFiltersOpen(true);
  }

  /* -------- options -------- */
  const macroOptions = useMemo(() => {
    const values = uniqSorted(items.map(getMacro).filter(Boolean));
    const list = values.map((value) => ({
      key: value,
      label: getMacroLabel(value, lang),
    }));
    list.sort((a, b) => a.label.localeCompare(b.label));
    return [{ key: ALL_KEY, label: ui.all }, ...list];
  }, [items, lang, ui.all]);

  const countryOptions = useMemo(() => {
    const keys = new Set<string>();
    const samples = new Map<string, string>();
    for (const it of items) {
      if (macroKey !== ALL_KEY && getMacro(it) !== macroKey) continue;
      const key = getCountryKey(it);
      if (key) {
        keys.add(key);
        if (!samples.has(key)) samples.set(key, getCountry(it));
      }
    }
    const list = Array.from(keys).map((key) => ({
      key,
      label: getLabel(COUNTRY_LABELS, key, lang, samples.get(key)) || "",
    }));
    list.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return [{ key: ALL_KEY, label: ui.all }, ...list];
  }, [items, macroKey, lang, ui.all]);

  const cityOptions = useMemo(() => {
    const keys = new Set<string>();
    const samples = new Map<string, string>();
    for (const it of items) {
      if (macroKey !== ALL_KEY && getMacro(it) !== macroKey) continue;
      if (countryKey !== ALL_KEY && getCountryKey(it) !== countryKey) continue;
      const key = getCityKey(it);
      if (key) {
        keys.add(key);
        if (!samples.has(key)) samples.set(key, getCity(it));
      }
    }
    const list = Array.from(keys).map((key) => ({
      key,
      label: getLabel(CITY_LABELS, key, lang, samples.get(key)) || "",
    }));
    list.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return [{ key: ALL_KEY, label: ui.all }, ...list];
  }, [items, macroKey, countryKey, lang, ui.all]);

  const areaPrimaryOptions = useMemo(() => {
    const keys = new Set<string>();
    const samples = new Map<string, string>();
    for (const it of items) {
      if (macroKey !== ALL_KEY && getMacro(it) !== macroKey) continue;
      if (countryKey !== ALL_KEY && getCountryKey(it) !== countryKey) continue;
      if (cityKey !== ALL_KEY && getCityKey(it) !== cityKey) continue;
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
  }, [items, macroKey, countryKey, cityKey, lang, ui.all]);

  const areaSecondaryOptions = useMemo(() => {
    const keys = new Set<string>();
    const samples = new Map<string, string>();
    for (const it of items) {
      if (macroKey !== ALL_KEY && getMacro(it) !== macroKey) continue;
      if (countryKey !== ALL_KEY && getCountryKey(it) !== countryKey) continue;
      if (cityKey !== ALL_KEY && getCityKey(it) !== cityKey) continue;
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
  }, [items, macroKey, countryKey, cityKey, lang, ui.all]);

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
    const qq = q.trim().toLowerCase();
    return items.filter((it) => {
      const m = getMacro(it);
      const ctryKey = getCountryKey(it);
      const ctyKey = getCityKey(it);
      const pArea = getPrimaryArea(it);
      const sAreas = getSecondaryAreas(it);
      const pAreaKey = getAreaKeyFromLabel(pArea);
      const sAreaKeys = sAreas.map((s) => getAreaKeyFromLabel(s)).filter(Boolean);

      if (macroKey !== ALL_KEY && m !== macroKey) return false;
      if (countryKey !== ALL_KEY && ctryKey !== countryKey) return false;
      if (cityKey !== ALL_KEY && ctyKey !== cityKey) return false;

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

      if (!qq) return true;

      const hay = [
        getName(it),
        getUrl(it),
        m,
        getCountry(it),
        getCity(it),
        getCountryLabel(it, lang),
        getCityLabel(it, lang),
        pArea,
        ...sAreas,
        getAreaLabel(pArea, lang),
        ...sAreas.map((s) => getAreaLabel(s, lang)),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [items, q, macroKey, countryKey, cityKey, areaPrimaryKey, areaSecondaryKey, lang]);

  const ordered = useMemo(() => {
    if (!seed) return filtered;
    return seededShuffle(filtered, seed);
  }, [filtered, seed]);

  const total = ordered.length;

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
                          if (value === "all") {
                            setMacroKey(ALL_KEY);
                          } else {
                            setMacroKey((cur) => (cur === value ? ALL_KEY : value));
                          }
                          setVisibleCount(20);
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
          "sticky top-[84px] z-30 overflow-hidden border-b backdrop-blur transition-[max-height,opacity,padding] duration-300",
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
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={ui.filters.search.toLowerCase()}
              className="mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none placeholder:text-zinc-400"
            />
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.category}
            </div>
            <select
              value={macroKey}
              onChange={(e) => {
                setMacroKey(e.target.value);
                setVisibleCount(20);
                setSpotlightIndex(0);
                newSeed();
              }}
              className="mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none"
            >
              {macroOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.areaPrimary}
            </div>
            <select
              value={areaPrimaryKey}
              onChange={(e) => {
                setAreaPrimaryKey(e.target.value);
                setVisibleCount(20);
                setSpotlightIndex(0);
              }}
              className="mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none"
            >
              {areaPrimaryOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.areaSecondary}
            </div>
            <select
              value={areaSecondaryKey}
              onChange={(e) => {
                setAreaSecondaryKey(e.target.value);
                setVisibleCount(20);
                setSpotlightIndex(0);
              }}
              className="mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none"
            >
              {areaSecondaryOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.country}
            </div>
            <select
              value={countryKey}
              onChange={(e) => {
                setCountryKey(e.target.value);
                setVisibleCount(20);
                setSpotlightIndex(0);
                newSeed();
              }}
              className="mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none"
            >
              {countryOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {ui.filters.city}
            </div>
            <select
              value={cityKey}
              onChange={(e) => {
                setCityKey(e.target.value);
                setVisibleCount(20);
                setSpotlightIndex(0);
                newSeed();
              }}
              className="mt-2 w-full border-b border-zinc-300 bg-transparent pb-2 text-[15px] outline-none"
            >
              {cityOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

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
              <div className="aspect-[16/9] w-full overflow-hidden bg-zinc-100">
                {getThumb(spotlight) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={getThumb(spotlight)} alt="" className="h-full w-full object-cover" />
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
                className="group min-w-0 border border-zinc-200 bg-white"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-100">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
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
              onClick={() => setVisibleCount((n) => Math.min(n + 20, Math.max(0, total - 1)))}
              className="btn cursor-pointer px-6 py-3 text-[16px] tracking-[0.02em]"
            >
              {ui.loadMore}
            </button>
          </div>
        )}
      </div>

      <section className="mt-16 border-t border-zinc-200 pt-8">
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
                Considere contribuir com o projeto.
              </>
            )}
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-6 border-t border-zinc-200 pt-6 sm:grid-cols-2 sm:gap-10 sm:border-t-0 sm:pt-0">
            <div className="flex flex-col items-center gap-4 sm:border-r sm:border-zinc-200 sm:pr-10">
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-900">Em reais via pix</div>
              <button
                onClick={() => setPixModalOpen(true)}
                className="btn cursor-pointer px-5 py-2 text-[16px] tracking-[0.02em] hidden sm:inline-flex"
              >
                Código / QR Code
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      "00020126580014BR.GOV.BCB.PIX0136d52e1499-3171-46ca-aa76-e02272dc624a5204000053039865802BR5925Francysregys Rodrigues de6009SAO PAULO62140510pFvdvHdqLY6304C9A4"
                    );
                    setPixCopied(true);
                  } catch {
                    showToast("Não foi possível copiar");
                  }
                }}
                className="btn cursor-pointer px-5 py-2 text-[16px] tracking-[0.02em] sm:hidden"
              >
                {pixCopied ? "Código copiado" : "Código / QR Code"}
              </button>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-900">
                {lang === "es" ? "en USD a través de PayPal" : "In USD via PayPal"}
              </div>
              <form action="https://www.paypal.com/donate" method="post" target="_top">
                <input type="hidden" name="hosted_button_id" value="E9XXLCKPSMR3E" />
                <button type="submit" className="btn cursor-pointer px-5 py-2 text-[16px] tracking-[0.02em]">
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

      {pixModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPixModalOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-900">Em reais via pix</div>
                <div className="mt-2 text-lg">Código / QR Code</div>
              </div>
              <button
                onClick={() => setPixModalOpen(false)}
                className="text-sm text-zinc-500 hover:text-zinc-700 cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 flex flex-col items-center gap-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  "00020126580014BR.GOV.BCB.PIX0136d52e1499-3171-46ca-aa76-e02272dc624a5204000053039865802BR5925Francysregys Rodrigues de6009SAO PAULO62140510pFvdvHdqLY6304C9A4"
                )}`}
                alt="QR Code Pix"
                className="h-[220px] w-[220px] border border-zinc-200"
              />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      "00020126580014BR.GOV.BCB.PIX0136d52e1499-3171-46ca-aa76-e02272dc624a5204000053039865802BR5925Francysregys Rodrigues de6009SAO PAULO62140510pFvdvHdqLY6304C9A4"
                    );
                    setPixCopied(true);
                  } catch {
                    showToast("Não foi possível copiar");
                  }
                }}
                className="btn cursor-pointer px-5 py-2 text-[16px] tracking-[0.02em]"
              >
                {pixCopied ? "Código copiado" : "Copiar código Pix"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
