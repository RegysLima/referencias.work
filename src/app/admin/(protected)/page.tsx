"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { canonicalCity, canonicalCountry } from "@/lib/location";

type RefItem = {
  id: string;
  name: string;
  url: string;

  macroType: string; // Studios | Designers | Photographers | Illustrators | Foundries
  areaPrimary?: string | null; // 1 valor
  areasSecondary?: string[]; // até 4
  tags?: string[]; // derivado automaticamente (não precisa editar)

  country?: string | null;
  city?: string | null;
  locations?: Array<{
    country?: string | null;
    city?: string | null;
  }>;

  thumbnailUrl?: string | null;
  thumbnailSource?: string | null;
  hidden?: boolean;

  updatedAt?: string | null;
  reviewedAt?: string | null;

  reviewFlags?: {
    country?: boolean;
    city?: boolean;
  };
};

const MACROS = ["Studios", "Designers", "Photographers", "Illustrators", "Foundries"] as const;

type SaveState = "idle" | "saving" | "saved" | "error";

const AREA_CANON_MAP: Record<string, string> = {
  packaging: "Embalagem",
  package: "Embalagem",
  "package design": "Embalagem",
  "pack design": "Embalagem",
  embalagens: "Embalagem",
  expografia: "Exposições",
  exibicoes: "Exposições",
  exibições: "Exposições",
  documentary: "Documental",
  "creative coding": "Programação Criativa",
  "creative-coding": "Programação Criativa",
  "design grafico": "Design Gráfico",
  drinks: "Bebidas",
  fashion: "Moda",
  travel: "Viagem",
  "ui/ux": "Digital",
  "ui ux": "Digital",
  ui: "Digital",
  ux: "Digital",
};

function uniq(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const k = (v ?? "").trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

function canonAreaLabel(value: string) {
  const raw = (value || "").trim();
  if (!raw) return "";
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return AREA_CANON_MAP[key] || raw;
}

function normalizeSecondaryAreas(primary: string | null | undefined, secondary: string[] | undefined) {
  const primaryLabel = canonAreaLabel(primary ?? "");
  const primaryCanon = primaryLabel.toLowerCase();
  const base = (secondary ?? [])
    .map((s) => canonAreaLabel(s))
    .map((s) => s.trim())
    .filter(Boolean);
  const filtered = uniq(base).filter((s) => s.toLowerCase() !== primaryCanon);
  return filtered.slice(0, 4);
}

function deriveTags(areaPrimary: string | null | undefined, areasSecondary: string[] | undefined) {
  return uniq([areaPrimary || "", ...(areasSecondary || [])]);
}

function normalizeUrl(u: string) {
  try {
    const url = new URL((u || "").trim());
    const p = url.pathname.replace(/\/+$/, "");
    url.hash = "";
    url.search = "";
    return `${url.protocol}//${url.host}${p}`.toLowerCase();
  } catch {
    return (u || "").trim().toLowerCase();
  }
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

function getDownloadName(url: string, fallback: string) {
  try {
    const parsed = new URL(url);
    const base = parsed.pathname.split("/").filter(Boolean).pop();
    if (base) return base;
  } catch {
    // ignore
  }
  return `${fallback}.jpg`;
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
        style={{ width: "100%", height: "100%", display: "block" }}
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

function normalizeMacro(raw: string) {
  const v = (raw || "").trim();
  const low = v.toLowerCase();

  // já canônicos
  if ((MACROS as readonly string[]).includes(v)) return v;

  // singular -> plural
  if (low === "studio") return "Studios";
  if (low === "designer") return "Designers";
  if (low === "photographer" || low === "fotografo" || low === "fotógrafo") return "Photographers";
  if (low === "illustrator" || low === "ilustrador") return "Illustrators";
  if (low === "foundry") return "Foundries";

  // variações em pt/en
  if (low.includes("studio")) return "Studios";
  if (low.includes("design")) return "Designers";
  if (low.includes("photo") || low.includes("foto")) return "Photographers";
  if (low.includes("illus") || low.includes("ilustr")) return "Illustrators";
  if (low.includes("found")) return "Foundries";

  return v || "Studios";
}

function buildAreaMap(items: RefItem[]) {
  const map = new Map<string, string>();
  for (const it of items) {
    const p = (it.areaPrimary ?? "").trim();
    if (p) map.set(p.toLowerCase(), p);
    const s = it.areasSecondary ?? [];
    for (const a of s) {
      const v = (a ?? "").trim();
      if (v) map.set(v.toLowerCase(), v);
    }
  }
  return map;
}

function getStringField(it: unknown, key: string) {
  if (!it || typeof it !== "object") return "";
  const v = (it as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function hasValue(value: string | null | undefined) {
  return Boolean((value ?? "").trim());
}

function isEmptyPlaceholderReference(it: RefItem) {
  const name = (it.name || "").trim().toLowerCase();
  const hasUrl = hasValue(it.url);
  const hasPrimary = hasValue(it.areaPrimary ?? null);
  const hasSecondary = (it.areasSecondary || []).some((v) => hasValue(v));
  const hasCountry = hasValue(it.country ?? null);
  const hasCity = hasValue(it.city ?? null);
  const hasLocations = (it.locations || []).some(
    (row) => hasValue(row?.country ?? null) || hasValue(row?.city ?? null)
  );
  const hasThumb = hasValue(it.thumbnailUrl ?? null);

  if (hasUrl || hasPrimary || hasSecondary || hasCountry || hasCity || hasLocations || hasThumb) {
    return false;
  }

  return name === "nova referência" || name === "nova referencia";
}

function hasLocationData(it: RefItem) {
  if (hasValue(it.country) || hasValue(it.city)) return true;
  const rows = it.locations || [];
  return rows.some((row) => hasValue(row?.country ?? null) || hasValue(row?.city ?? null));
}

function hasActiveReviewFlags(it: RefItem) {
  if (!it.reviewFlags) return false;
  const needsCountry = Boolean(it.reviewFlags.country) && !hasLocationData(it);
  const needsCity = Boolean(it.reviewFlags.city) && !hasLocationData(it);
  return needsCountry || needsCity;
}

function normalizeReviewFlags(it: RefItem) {
  if (!it.reviewFlags) return it;
  const nextFlags = { ...it.reviewFlags };
  if (nextFlags.country && hasLocationData(it)) delete nextFlags.country;
  if (nextFlags.city && hasLocationData(it)) delete nextFlags.city;
  const hasAny = Boolean(nextFlags.country || nextFlags.city);
  return {
    ...it,
    reviewFlags: hasAny ? nextFlags : undefined,
  };
}

function normalizeCountryValue(value: string | null | undefined) {
  const next = canonicalCountry(value ?? "");
  return next || null;
}

function normalizeCityValue(value: string | null | undefined) {
  const next = canonicalCity(value ?? "");
  return next || null;
}

function normalizeLocations(
  input:
    | Array<{
        country?: string | null;
        city?: string | null;
      }>
    | undefined,
  country: string | null | undefined,
  city: string | null | undefined,
  preserveEmptyRows = false
) {
  const normalizedInput =
    (input || []).map((row) => ({
      country: row?.country ?? null,
      city: row?.city ?? null,
    })) || [];

  const rows =
    normalizedInput.length > 0
      ? normalizedInput.map((row, idx) =>
          idx === 0
            ? {
                country: country ?? row.country ?? null,
                city: city ?? row.city ?? null,
              }
            : row
        )
      : [{ country: country ?? null, city: city ?? null }];

  const out: Array<{ country?: string | null; city?: string | null }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const c = normalizeCountryValue(row.country ?? null);
    const ct = normalizeCityValue(row.city ?? null);
    if (!c && !ct) {
      if (preserveEmptyRows) out.push({ country: null, city: null });
      continue;
    }
    const key = `${(c || "").toLowerCase()}::${(ct || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ country: c, city: ct });
  }
  return out;
}

type ThumbModalState = {
  open: boolean;
  itemId: string | null;
  baseUrl: string;
  loading: boolean;
  error: string;
  candidates: string[];
};

const ADMIN_PAGE_SIZE = 20;
const ADMIN_REFS_CACHE_KEY = "rw_admin_refs_cache_v1";

export default function AdminPage() {
  const [items, setItems] = useState<RefItem[]>([]);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const deferredQ = useDeferredValue(q);
  const [, startQueryTransition] = useTransition();
  const [onlyNoImage, setOnlyNoImage] = useState(false);
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false);
  const [onlyBrokenImages, setOnlyBrokenImages] = useState(false);
  const [macroFilter, setMacroFilter] = useState<string>("Todos");
  const [currentPage, setCurrentPage] = useState(1);

  const [openId, setOpenId] = useState<string | null>(null);
  const [primaryAreaDraft, setPrimaryAreaDraft] = useState<Record<string, string>>({});
  const [primaryAreaSuggestOpenId, setPrimaryAreaSuggestOpenId] = useState<string | null>(null);
  const [primaryAreaSuggestIndex, setPrimaryAreaSuggestIndex] = useState(0);
  const [secondaryDraft, setSecondaryDraft] = useState<Record<string, string>>({});
  const [secondarySuggestOpenId, setSecondarySuggestOpenId] = useState<string | null>(null);
  const [secondarySuggestIndex, setSecondarySuggestIndex] = useState(0);
  const [countryDraft, setCountryDraft] = useState<Record<string, string>>({});
  const [countrySuggestOpenId, setCountrySuggestOpenId] = useState<string | null>(null);
  const [countrySuggestIndex, setCountrySuggestIndex] = useState(0);
  const [cityDraft, setCityDraft] = useState<Record<string, string>>({});
  const [citySuggestOpenId, setCitySuggestOpenId] = useState<string | null>(null);
  const [citySuggestIndex, setCitySuggestIndex] = useState(0);
  const [locationDraft, setLocationDraft] = useState<Record<string, string>>({});
  const [locationSuggestOpenKey, setLocationSuggestOpenKey] = useState<string | null>(null);
  const [locationSuggestIndex, setLocationSuggestIndex] = useState(0);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [autoSavePending, setAutoSavePending] = useState(false);
  const [autoSaveActive, setAutoSaveActive] = useState(false);
  const [checkingThumbs, setCheckingThumbs] = useState(false);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    itemId: string | null;
    name: string;
  }>({ open: false, itemId: null, name: "" });

  // toast simples (feedback)
  const [toast, setToast] = useState<string>("");
  const toastTimer = useRef<number | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1200);
  }

  // modal thumbs
  const [thumbModal, setThumbModal] = useState<ThumbModalState>({
    open: false,
    itemId: null,
    baseUrl: "",
    loading: false,
    error: "",
    candidates: [],
  });

  const hydrateItems = useCallback((loaded: RefItem[], options?: { autoFix?: boolean }) => {
    // normaliza macroType (corrige “Studio” etc) ao carregar
    const normalized = loaded.map((it) => {
      const macroType = normalizeMacro(
        getStringField(it, "macroType") || getStringField(it, "macro")
      );
      const ap = (it.areaPrimary ?? "") as string;
      const as = normalizeSecondaryAreas(ap, (it.areasSecondary ?? []) as string[]);
      const locations = normalizeLocations(it.locations, it.country ?? null, it.city ?? null);
      return {
        ...it,
        macroType,
        areasSecondary: as,
        tags: deriveTags(ap, as),
        country: locations[0]?.country ? normalizeCountryValue(locations[0].country ?? null) : null,
        city: locations[0]?.city ? normalizeCityValue(locations[0].city ?? null) : null,
        locations,
      };
    });

    const cleaned = normalized.filter((it) => !isEmptyPlaceholderReference(it));
    let hadDuplicateIds = false;
    const seenIds = new Set<string>();
    const uniqued = cleaned.map((it, idx) => {
      let nextId = (it.id || "").trim();
      if (!nextId) {
        hadDuplicateIds = true;
        nextId = `ref-${Date.now()}-${idx}`;
      }
      if (seenIds.has(nextId)) {
        hadDuplicateIds = true;
        nextId = `${nextId}-${Date.now()}-${idx}`;
      }
      seenIds.add(nextId);
      if (nextId === it.id) return it;
      return { ...it, id: nextId };
    });

    setItems(uniqued.map(normalizeReviewFlags));

    const primaryAreaDraftMap: Record<string, string> = {};
    const draft: Record<string, string> = {};
    const countryDraftMap: Record<string, string> = {};
    const cityDraftMap: Record<string, string> = {};
    const locationDraftMap: Record<string, string> = {};
    for (const it of uniqued) primaryAreaDraftMap[it.id] = (it.areaPrimary ?? "").trim();
    for (const it of uniqued) draft[it.id] = (it.areasSecondary ?? []).join(", ");
    for (const it of uniqued) countryDraftMap[it.id] = (it.country ?? "").trim();
    for (const it of uniqued) cityDraftMap[it.id] = (it.city ?? "").trim();
    for (const it of uniqued) {
      for (let idx = 1; idx < (it.locations || []).length; idx += 1) {
        const row = it.locations?.[idx];
        locationDraftMap[`${it.id}:${idx}:country`] = (row?.country ?? "").trim();
        locationDraftMap[`${it.id}:${idx}:city`] = (row?.city ?? "").trim();
      }
    }
    setPrimaryAreaDraft(primaryAreaDraftMap);
    setSecondaryDraft(draft);
    setCountryDraft(countryDraftMap);
    setCityDraft(cityDraftMap);
    setLocationDraft(locationDraftMap);

    if (options?.autoFix && (cleaned.length < normalized.length || hadDuplicateIds)) {
      setAutoSavePending(true);
      showToast("Cards inválidos corrigidos.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      // 1) Mostra snapshot local imediatamente (reduz delay perceptível de primeira carga)
      try {
        const raw = window.localStorage.getItem(ADMIN_REFS_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { items?: RefItem[] };
          if (Array.isArray(cached?.items) && cached.items.length) {
            hydrateItems(cached.items, { autoFix: false });
          }
        }
      } catch {
        // ignore cache parse
      }

      // 2) Atualiza com dados frescos da API
      const res = await fetch("/api/admin/references");
      const db = await res.json();
      const loaded: RefItem[] = db.items ?? [];
      hydrateItems(loaded, { autoFix: true });
      try {
        window.localStorage.setItem(
          ADMIN_REFS_CACHE_KEY,
          JSON.stringify({ items: loaded, updatedAt: db?.updatedAt || null })
        );
      } catch {
        // ignore localStorage quota/issues
      }
    })();
  }, [hydrateItems]);

  const duplicateMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const k = normalizeUrl(it.url);
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [items]);

  function setBrokenThumbState(id: string, broken: boolean) {
    setBrokenThumbs((prev) => {
      const current = prev[id] === true;
      if (broken) {
        if (current) return prev;
        return { ...prev, [id]: true };
      }
      // Evita persistir "false" e elimina centenas de re-renders em onLoad.
      if (!current) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function checkBrokenImages() {
    const candidates = items
      .filter((i) => (i.thumbnailUrl || "").trim())
      .map((i) => ({ id: i.id, url: (i.thumbnailUrl || "").trim() }));
    const imageCandidates = candidates.filter(
      (item) => !isVideoUrl(item.url) && !isVimeoUrl(item.url)
    );

    if (!imageCandidates.length) {
      showToast("Nenhuma imagem para verificar");
      return;
    }

    setCheckingThumbs(true);
    setBrokenThumbs({});
    showToast("Verificando imagens…");

    const queue = [...imageCandidates];
    const next = async (): Promise<{ id: string; ok: boolean } | null> => {
      const item = queue.shift();
      if (!item) return null;
      return new Promise((resolve) => {
        const img = new Image();
        const cleanup = () => {
          img.onload = null;
          img.onerror = null;
        };
        img.onload = () => {
          cleanup();
          resolve({ id: item.id, ok: true });
        };
        img.onerror = () => {
          cleanup();
          resolve({ id: item.id, ok: false });
        };
        img.referrerPolicy = "no-referrer";
        img.decoding = "async";
        img.src = item.url;
      });
    };

    const CONCURRENCY = 6;
    let brokenCount = 0;
    const checkedState: Record<string, boolean> = {};
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const result = await next();
        if (!result) break;
        checkedState[result.id] = !result.ok;
        if (!result.ok) brokenCount += 1;
      }
    });

    await Promise.all(workers);
    setBrokenThumbs(checkedState);

    setCheckingThumbs(false);
    showToast(
      brokenCount
        ? `${brokenCount} imagem(ns) com problema`
        : "Nenhuma imagem quebrada encontrada"
    );
  }

  async function uploadThumbnail(itemId: string, file: File) {
    if (!file) return;
    setUploadingId(itemId);
    showToast("Enviando imagem…");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      if (!res.ok) {
        showToast("Falha no upload");
        return;
      }
      const data = await res.json();
      if (data?.url) {
        updateItem(itemId, { thumbnailUrl: data.url, thumbnailSource: "upload" });
        showToast("Imagem enviada");
        setAutoSavePending(true);
      } else {
        showToast("Falha no upload");
      }
    } catch {
      showToast("Falha no upload");
    } finally {
      setUploadingId(null);
    }
  }

  async function downloadThumbnail(url: string, fallbackName: string) {
    if (!url) return;
    if (isVideoUrl(url) || isVimeoUrl(url)) {
      showToast("Download indisponivel para videos");
      return;
    }
    try {
      const res = await fetch(`/api/admin/download?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error("download_failed");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = getDownloadName(url, fallbackName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      showToast("Download iniciado");
    } catch {
      showToast("Nao foi possivel baixar. Abrindo em nova aba");
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  const filtered = useMemo(() => {
    const queryTokens = tokenizeSearchQuery(deferredQ);
    const normalizedQuery = normalizeSearchText(deferredQ);

    const base = items.filter((i) => {
      if (macroFilter !== "Todos" && i.macroType !== macroFilter) return false;
      if (onlyNoImage && i.thumbnailUrl) return false;
      if (onlyBrokenImages && !brokenThumbs[i.id]) return false;
      if (onlyUnreviewed && i.reviewedAt) return false;
      if (onlyNeedsReview && !hasActiveReviewFlags(i)) return false;

      if (onlyDuplicates) {
        const k = normalizeUrl(i.url);
        if (!k) return false;
        if ((duplicateMap.get(k) ?? 0) < 2) return false;
      }

      return true;
    });

    if (!queryTokens.length) return base;

    const ranked = base
      .map((i) => {
        const name = normalizeSearchText(i.name || "");
        const url = normalizeSearchText(i.url || "");
        const macro = normalizeSearchText(i.macroType || "");
        const area = normalizeSearchText(
          [i.areaPrimary || "", ...(i.areasSecondary || [])].join(" ")
        );
        const countries = normalizeSearchText(
          [
            normalizeCountryValue(i.country || "") || "",
            ...((i.locations || [])
              .map((row) => normalizeCountryValue(row?.country ?? null) || "")
              .filter(Boolean)),
          ].join(" ")
        );
        const cities = normalizeSearchText(
          [
            normalizeCityValue(i.city || "") || "",
            ...((i.locations || [])
              .map((row) => normalizeCityValue(row?.city ?? null) || "")
              .filter(Boolean)),
          ].join(" ")
        );
        const status = normalizeSearchText(
          `${i.reviewedAt ? "revisado" : "nao revisado"} ${hasActiveReviewFlags(i) ? "revisar" : ""}`
        );

        let score = 0;
        let strictScore = 0;
        let strictMatchedAll = true;
        for (const token of queryTokens) {
          const nameScore = scoreTokenInText(name, token, 140, 120, 95);
          const urlScore = scoreTokenInText(url, token, 110, 95, 70);
          const strictTokenScore = Math.max(nameScore, urlScore);
          if (!strictTokenScore) {
            strictMatchedAll = false;
          } else {
            strictScore += strictTokenScore;
          }

          const tokenScore = Math.max(
            nameScore,
            urlScore,
            scoreTokenInText(area, token, 40, 34, 28),
            scoreTokenInText(countries, token, 36, 30, 24),
            scoreTokenInText(cities, token, 36, 30, 24),
            scoreTokenInText(macro, token, 34, 28, 22),
            scoreTokenInText(status, token, 20, 16, 12)
          );
          if (!tokenScore) return null;
          score += tokenScore;
        }

        if (normalizedQuery && name.includes(normalizedQuery)) score += 90;
        if (normalizedQuery && url.includes(normalizedQuery)) score += 45;
        if (strictMatchedAll && normalizedQuery && name.includes(normalizedQuery)) strictScore += 90;
        if (strictMatchedAll && normalizedQuery && url.includes(normalizedQuery)) strictScore += 45;
        if (!strictMatchedAll) strictScore = 0;

        return { i, score, strictScore };
      })
      .filter((entry): entry is { i: RefItem; score: number; strictScore: number } => Boolean(entry))
      .sort((a, b) => b.score - a.score || (a.i.name || "").localeCompare(b.i.name || ""));

    const strictRanked = ranked.filter((entry) => entry.strictScore > 0);
    if (strictRanked.length) {
      strictRanked.sort(
        (a, b) => b.strictScore - a.strictScore || (a.i.name || "").localeCompare(b.i.name || "")
      );
      return strictRanked.map((entry) => entry.i);
    }

    return ranked.map((entry) => entry.i);
  }, [
    items,
    deferredQ,
    onlyNoImage,
    onlyBrokenImages,
    onlyUnreviewed,
    onlyDuplicates,
    onlyNeedsReview,
    macroFilter,
    duplicateMap,
    brokenThumbs,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * ADMIN_PAGE_SIZE;
    return filtered.slice(start, start + ADMIN_PAGE_SIZE);
  }, [filtered, safeCurrentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    deferredQ,
    onlyNoImage,
    onlyUnreviewed,
    onlyDuplicates,
    onlyNeedsReview,
    onlyBrokenImages,
    macroFilter,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const areaMap = useMemo(() => buildAreaMap(items), [items]);
  const areaOptions = useMemo(() => {
    return Array.from(new Set(areaMap.values())).sort((a, b) => a.localeCompare(b));
  }, [areaMap]);

  const countryOptions = useMemo(() => {
    const values: string[] = [];
    for (const it of items) {
      const primary = normalizeCountryValue(it.country ?? null);
      if (primary) values.push(primary.trim());
      for (const row of it.locations || []) {
        const c = normalizeCountryValue(row?.country ?? null);
        if (c) values.push(c.trim());
      }
    }
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const cityOptions = useMemo(() => {
    const values: string[] = [];
    for (const it of items) {
      const primary = normalizeCityValue(it.city ?? null);
      if (primary) values.push(primary.trim());
      for (const row of it.locations || []) {
        const c = normalizeCityValue(row?.city ?? null);
        if (c) values.push(c.trim());
      }
    }
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [items]);

  function updateItem(id: string, patch: Partial<RefItem>) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;

        const next: RefItem = { ...i, ...patch, updatedAt: new Date().toISOString() };

        if (i.reviewedAt) {
          const keys = Object.keys(patch);
          const reviewKeys = [
            "name",
            "url",
            "macroType",
            "areaPrimary",
            "areasSecondary",
            "country",
            "city",
            "thumbnailUrl",
            "thumbnailSource",
          ];
          if (keys.some((k) => reviewKeys.includes(k))) {
            next.reviewedAt = null;
          }
        }

        // normaliza macroType sempre que mexer (evita “Studio” solto)
        next.macroType = normalizeMacro(next.macroType);

        const ap = canonAreaLabel((next.areaPrimary ?? "") as string);
        next.areaPrimary = ap || "";
        const as = normalizeSecondaryAreas(ap, (next.areasSecondary ?? []) as string[]);
        next.areasSecondary = as;
        next.tags = deriveTags(ap, as);
        const locations = normalizeLocations(next.locations, next.country, next.city, true);
        next.locations = locations;
        const firstResolved =
          locations.find((row) => Boolean(normalizeCountryValue(row?.country ?? null) || normalizeCityValue(row?.city ?? null))) ||
          null;
        next.country = firstResolved?.country ? normalizeCountryValue(firstResolved.country ?? null) : null;
        next.city = firstResolved?.city ? normalizeCityValue(firstResolved.city ?? null) : null;

        // se estava "Salvo ✓", volta para idle quando muda algo
        setSaveState((s) => (s === "saved" ? "idle" : s));
        setSaveMessage((m) => (saveState === "saved" ? "" : m));

        return normalizeReviewFlags(next);
      })
    );
  }

  function normalizeAreaValue(value: string) {
    const key = (value || "").trim().toLowerCase();
    if (!key) return "";
    return areaMap.get(key) || "";
  }

  function getLocationSuggestions(
    draftValue: string,
    options: string[],
    normalizeLocation: (value: string | null | undefined) => string | null
  ) {
    const query = normalizeSearchText(draftValue);
    if (!query) return options.slice(0, 8);

    const normalizedCurrent = normalizeSearchText(normalizeLocation(draftValue || "") || "");

    return options
      .filter((option) => {
        const normalizedOption = normalizeSearchText(option);
        return (
          normalizedOption.startsWith(query) ||
          normalizedOption.includes(` ${query}`) ||
          normalizedOption === normalizedCurrent
        );
      })
      .slice(0, 8);
  }

  function commitCountryDraft(id: string, value: string) {
    const normalized = normalizeCountryValue(value || null);
    const nextValue = normalized || "";
    setCountryDraft((prev) => ({ ...prev, [id]: nextValue }));
    const current = items.find((it) => it.id === id);
    const rows = current?.locations ? [...current.locations] : [];
    const first = rows[0] || { country: null, city: current?.city ?? null };
    rows[0] = { ...first, country: normalized };
    updateItem(id, { country: normalized, locations: rows });
  }

  function commitCityDraft(id: string, value: string) {
    const normalized = normalizeCityValue(value || null);
    const nextValue = normalized || "";
    setCityDraft((prev) => ({ ...prev, [id]: nextValue }));
    const current = items.find((it) => it.id === id);
    const rows = current?.locations ? [...current.locations] : [];
    const first = rows[0] || { country: current?.country ?? null, city: null };
    rows[0] = { ...first, city: normalized };
    updateItem(id, { city: normalized, locations: rows });
  }

  function getPrimaryAreaSuggestions(draftValue: string) {
    const query = normalizeSearchText(draftValue);
    if (!query) return areaOptions.slice(0, 8);
    return areaOptions
      .filter((option) => {
        const normalizedOption = normalizeSearchText(option);
        return normalizedOption.startsWith(query) || normalizedOption.includes(` ${query}`);
      })
      .slice(0, 8);
  }

  function commitPrimaryAreaDraft(id: string, value: string) {
    const normalized = normalizeAreaValue(value || "");
    if (!normalized && value.trim()) {
      showToast("Área não encontrada na lista. Escolha uma sugestão.");
    }
    const nextValue = normalized || "";
    setPrimaryAreaDraft((prev) => ({ ...prev, [id]: nextValue }));
    updateItem(id, { areaPrimary: nextValue });
  }

  const areaOptionIndex = useMemo(() => {
    const entries = areaOptions.map((label) => {
      const norm = normalizeSearchText(label);
      return {
        label,
        norm,
        tokens: norm.split(/\s+/).filter(Boolean),
      };
    });
    entries.sort((a, b) => b.tokens.length - a.tokens.length);
    return entries;
  }, [areaOptions]);

  function parseSecondaryFromInput(text: string) {
    const normalizedText = normalizeSearchText(
      (text || "").replace(/[,;|]+/g, " ")
    );
    const words = normalizedText.split(/\s+/).filter(Boolean);
    const found: string[] = [];
    let invalidCount = 0;

    let i = 0;
    while (i < words.length) {
      let matched: { label: string; tokensLen: number } | null = null;
      for (const option of areaOptionIndex) {
        const len = option.tokens.length;
        if (!len || i + len > words.length) continue;
        let ok = true;
        for (let j = 0; j < len; j += 1) {
          if (words[i + j] !== option.tokens[j]) {
            ok = false;
            break;
          }
        }
        if (ok) {
          matched = { label: option.label, tokensLen: len };
          break;
        }
      }

      if (matched) {
        found.push(matched.label);
        i += matched.tokensLen;
        continue;
      }

      const single = words[i] || "";
      const canon = canonAreaLabel(single);
      const normalized = normalizeAreaValue(canon);
      if (normalized) {
        found.push(normalized);
      } else {
        invalidCount += 1;
      }
      i += 1;
    }

    return { values: uniq(found), invalidCount };
  }

  function getSecondarySuggestions(draft: string) {
    const words = normalizeSearchText(draft).split(/\s+/).filter(Boolean);
    const query = words[words.length - 1] || "";
    if (!query) return areaOptions.slice(0, 8);
    return areaOptions
      .filter((option) => {
        const n = normalizeSearchText(option);
        return n.startsWith(query) || n.includes(` ${query}`);
      })
      .slice(0, 8);
  }

  function applySecondarySuggestion(draft: string, suggestion: string) {
    const rawWords = (draft || "")
      .replace(/[,;|]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!rawWords.length) return `${suggestion} `;
    rawWords[rawWords.length - 1] = suggestion;
    return `${rawWords.join(" ")} `;
  }

  function enforceSecondaryDraftLimit(draft: string) {
    const { values } = parseSecondaryFromInput(draft);
    if (values.length <= 4) return draft;
    return `${values.slice(0, 4).join(" ")} `;
  }

  function applySecondaryAreas(id: string, primaryArea: string | null | undefined, draftValue: string) {
    const { values, invalidCount } = parseSecondaryFromInput(draftValue);
    const normalized = values.map((v) => normalizeAreaValue(v)).filter(Boolean);
    if (invalidCount > 0) {
      showToast("Algumas áreas secundárias não existem na lista.");
    }
    const parsed = normalizeSecondaryAreas(primaryArea ?? "", normalized);
    setSecondaryDraft((prev) => ({ ...prev, [id]: parsed.join(", ") }));
    updateItem(id, { areasSecondary: parsed });
  }

  function updateLocationRow(
    id: string,
    rowIndex: number,
    patch: { country?: string | null; city?: string | null }
  ) {
    const current = items.find((it) => it.id === id);
    const rows = current?.locations ? [...current.locations] : [];
    const base = rows[rowIndex] || { country: null, city: null };
    rows[rowIndex] = {
      ...base,
      ...(patch.country !== undefined ? { country: normalizeCountryValue(patch.country ?? null) } : {}),
      ...(patch.city !== undefined ? { city: normalizeCityValue(patch.city ?? null) } : {}),
    };
    updateItem(id, { locations: rows });
  }

  function commitLocationDraft(
    id: string,
    rowIndex: number,
    field: "country" | "city",
    value: string
  ) {
    const normalized =
      field === "country"
        ? normalizeCountryValue(value || null)
        : normalizeCityValue(value || null);
    setLocationDraft((prev) => ({
      ...prev,
      [`${id}:${rowIndex}:${field}`]: normalized || "",
    }));
    if (field === "country") {
      updateLocationRow(id, rowIndex, { country: normalized });
    } else {
      updateLocationRow(id, rowIndex, { city: normalized });
    }
  }

  function addLocationRow(id: string) {
    const current = items.find((it) => it.id === id);
    const rows = current?.locations ? [...current.locations] : [];
    // index 0 é reservado para o país/cidade principal.
    // garante a linha base antes de adicionar uma linha extra visível.
    if (!rows.length) {
      rows.push({
        country: normalizeCountryValue(current?.country ?? null),
        city: normalizeCityValue(current?.city ?? null),
      });
    }
    const rowIndex = rows.length;
    rows.push({ country: null, city: null });
    setLocationDraft((prev) => ({
      ...prev,
      [`${id}:${rowIndex}:country`]: "",
      [`${id}:${rowIndex}:city`]: "",
    }));
    updateItem(id, { locations: rows });
  }

  function removeLocationRow(id: string, rowIndex: number) {
    const current = items.find((it) => it.id === id);
    const rows = current?.locations ? [...current.locations] : [];
    if (rowIndex <= 0 || rowIndex >= rows.length) return;
    rows.splice(rowIndex, 1);
    setLocationDraft((prev) => {
      const copy = { ...prev };
      delete copy[`${id}:${rowIndex}:country`];
      delete copy[`${id}:${rowIndex}:city`];
      return copy;
    });
    updateItem(id, { locations: rows });
  }

  function addNew() {
    const id = `manual-${Date.now()}`;
    const now = new Date().toISOString();

    const newItem: RefItem = {
      id,
      name: "Nova referência",
      url: "",
      macroType: "Designers",
      areaPrimary: "",
      areasSecondary: [],
      tags: [],
      country: null,
      city: null,
      locations: [],
      thumbnailUrl: null,
      thumbnailSource: "manual",
      updatedAt: now,
      reviewedAt: null,
    };

    setItems((prev) => [newItem, ...prev]);
    setPrimaryAreaDraft((prev) => ({ ...prev, [id]: "" }));
    setSecondaryDraft((prev) => ({ ...prev, [id]: "" }));
    setCountryDraft((prev) => ({ ...prev, [id]: "" }));
    setCityDraft((prev) => ({ ...prev, [id]: "" }));
    setOpenId(id);

    setSaveState("idle");
    setSaveMessage("");
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setOpenId((prev) => (prev === id ? null : prev));

    setPrimaryAreaDraft((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setSecondaryDraft((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setCountryDraft((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setCityDraft((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    setSaveState("idle");
    setSaveMessage("");
  }

  function confirmRemove(item: RefItem) {
    setDeleteConfirm({ open: true, itemId: item.id, name: item.name || "esta referência" });
  }

  function closeRemoveConfirm() {
    setDeleteConfirm({ open: false, itemId: null, name: "" });
  }

  function handleRemoveConfirmed() {
    if (!deleteConfirm.itemId) return;
    remove(deleteConfirm.itemId);
    closeRemoveConfirm();
  }

  async function saveAll() {
    setSaveState("saving");
    setSaveMessage("Salvando…");

    try {
      const res = await fetch("/api/admin/references", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        setSaveState("error");
        setSaveMessage("Erro ao salvar. Tente novamente.");
        return;
      }

      setSaveState("saved");
      setSaveMessage(autoSaveActive ? "Salvo automaticamente ✓" : "Salvo ✓");
      showToast("Salvo ✓");
      setAutoSaveActive(false);

      window.setTimeout(() => {
        setSaveState("idle");
        setSaveMessage("");
        setAutoSaveActive(false);
      }, 1800);
    } catch {
      setSaveState("error");
      setSaveMessage("Falha de rede. Verifique sua conexão.");
      setAutoSaveActive(false);
    }
  }

  useEffect(() => {
    if (!autoSavePending) return;
    if (saveState === "saving") return;
    if (saveState === "saved") {
      setAutoSavePending(false);
      return;
    }
    setAutoSavePending(false);
    setAutoSaveActive(true);
    saveAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSavePending, saveState, items]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  function markReviewed(id: string) {
    updateItem(id, { reviewedAt: new Date().toISOString(), hidden: false });
    setAutoSavePending(true);
  }

  function openUrl(url: string) {
    const u = (url || "").trim();
    if (!u) return;
    window.open(u, "_blank", "noopener,noreferrer");
  }

  const saveBtnClass =
    saveState === "error"
      ? "border-red-700 bg-red-950/40 hover:border-red-600"
      : saveState === "saved"
      ? "border-emerald-700 bg-emerald-950/30 hover:border-emerald-600"
      : "border-zinc-800 bg-zinc-950 hover:border-zinc-700";

  const saveBtnLabel =
    saveState === "saving"
      ? "Salvando…"
      : saveState === "saved"
      ? "Salvo ✓"
      : saveState === "error"
      ? "Erro ao salvar"
      : "Salvar";

  async function openThumbPicker(itemId: string, baseUrl: string) {
    const url = (baseUrl || "").trim();
    if (!url) {
      showToast("Preencha a URL primeiro.");
      return;
    }

    setThumbModal({
      open: true,
      itemId,
      baseUrl: url,
      loading: true,
      error: "",
      candidates: [],
    });

    try {
      const res = await fetch(`/api/admin/thumbs?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        setThumbModal((s) => ({
          ...s,
          loading: false,
          error: "Não foi possível buscar mídias. (site bloqueou ou falha na requisição)",
        }));
        return;
      }

      const data = await res.json();
      const candidates: string[] = Array.isArray(data?.candidates) ? data.candidates : [];

      setThumbModal((s) => ({
        ...s,
        loading: false,
        candidates,
        error: candidates.length ? "" : "Nenhuma mídia encontrada nas páginas de projetos/works/portfolio.",
      }));
    } catch {
      setThumbModal((s) => ({
        ...s,
        loading: false,
        error: "Falha ao buscar mídias. Verifique conexão / URL.",
      }));
    }
  }

  function closeThumbPicker() {
    setThumbModal({ open: false, itemId: null, baseUrl: "", loading: false, error: "", candidates: [] });
  }

  function pickThumb(url: string) {
    if (!thumbModal.itemId) return;
    updateItem(thumbModal.itemId, { thumbnailUrl: url, thumbnailSource: "picker" });
    showToast("Thumbnail aplicada");
    closeThumbPicker();
  }

  useEffect(() => {
    if (!thumbModal.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeThumbPicker();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [thumbModal.open]);

  useEffect(() => {
    if (!deleteConfirm.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeRemoveConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteConfirm.open]);

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-6">
      {/* TOAST */}
      {toast ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 shadow-lg">
          {toast}
        </div>
      ) : null}

      {/* DELETE CONFIRM MODAL */}
      {deleteConfirm.open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeRemoveConfirm}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-800 px-5 py-4">
              <div className="text-sm text-zinc-400">Confirmar exclusão</div>
              <div className="mt-2 text-base font-medium">Excluir {deleteConfirm.name}?</div>
            </div>

            <div className="px-5 py-4 text-sm text-zinc-400">
              Essa ação não pode ser desfeita.
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
              <button
                onClick={closeRemoveConfirm}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleRemoveConfirmed}
                className="rounded-xl border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-200 hover:border-red-600"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* THUMB MODAL */}
      {thumbModal.open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeThumbPicker}
        >
          <div
            className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
              <div className="min-w-0">
                <div className="text-sm text-zinc-400">Escolher thumbnail</div>
                <div className="mt-1 truncate text-base font-medium">{thumbModal.baseUrl}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Buscando imagens e vídeos em páginas típicas de projetos/works/portfolio.
                </div>
              </div>

              <button
                onClick={closeThumbPicker}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
              >
                Fechar
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {thumbModal.loading ? (
                <div className="text-sm text-zinc-400">Buscando mídias…</div>
              ) : thumbModal.error ? (
                <div className="text-sm text-zinc-300">
                  {thumbModal.error}
                  <div className="mt-2 text-xs text-zinc-500">
                    Dica: alguns sites bloqueiam scraping. Nesse caso, você ainda pode colar uma URL manualmente no campo.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {thumbModal.candidates.map((src) => (
                    <button
                      key={src}
                      onClick={() => pickThumb(src)}
                      onMouseDown={(e) => e.preventDefault()}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-left hover:border-zinc-700"
                      title="Clique para usar"
                    >
                      <div className="aspect-[4/3] w-full bg-zinc-900">
                        {isVideoUrl(src) || isVimeoUrl(src) ? (
                          <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-200">
                            <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs uppercase tracking-[0.12em]">
                              Video
                            </span>
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            fetchPriority="low"
                            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                          />
                        )}
                      </div>
                      <div className="p-2">
                        <div className="truncate text-[11px] text-zinc-400">{src}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!thumbModal.loading ? (
              <div className="border-t border-zinc-800 px-5 py-4">
                <button
                  onClick={() => openThumbPicker(thumbModal.itemId || "", thumbModal.baseUrl)}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                >
                  Buscar novamente
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="h-fit lg:sticky lg:top-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-xs text-zinc-400">{filtered.length} itens</div>

            <button
              onClick={addNew}
              className="mt-4 w-full rounded-xl border border-white bg-white px-3 py-2 text-sm text-black hover:opacity-90"
            >
              + Adicionar
            </button>

            <input
              value={qInput}
              onChange={(e) => {
                const next = e.target.value;
                setQInput(next);
                startQueryTransition(() => setQ(next));
              }}
              placeholder="Buscar"
              className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
            />

            <select
              value={macroFilter}
              onChange={(e) => setMacroFilter(e.target.value)}
              className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 pr-12 text-sm outline-none focus:border-zinc-600"
            >
              <option value="Todos">Todas as categorias</option>
              {MACROS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <div className="mt-4 space-y-3">
              <label className="flex items-center justify-between text-sm text-zinc-300">
                <span>Sem imagem</span>
                <span className="relative inline-flex h-5 w-9">
                  <input
                    type="checkbox"
                    checked={onlyNoImage}
                    onChange={(e) => setOnlyNoImage(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-full bg-zinc-800 transition peer-checked:bg-white/90" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-zinc-200 transition peer-checked:translate-x-4 peer-checked:bg-black" />
                </span>
              </label>

              <label className="flex items-center justify-between text-sm text-zinc-300">
                <span>Não revisados</span>
                <span className="relative inline-flex h-5 w-9">
                  <input
                    type="checkbox"
                    checked={onlyUnreviewed}
                    onChange={(e) => setOnlyUnreviewed(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-full bg-zinc-800 transition peer-checked:bg-white/90" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-zinc-200 transition peer-checked:translate-x-4 peer-checked:bg-black" />
                </span>
              </label>

              <label className="flex items-center justify-between text-sm text-zinc-300">
                <span>URL Duplicadas</span>
                <span className="relative inline-flex h-5 w-9">
                  <input
                    type="checkbox"
                    checked={onlyDuplicates}
                    onChange={(e) => setOnlyDuplicates(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-full bg-zinc-800 transition peer-checked:bg-white/90" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-zinc-200 transition peer-checked:translate-x-4 peer-checked:bg-black" />
                </span>
              </label>

              <label className="flex items-center justify-between text-sm text-zinc-300">
                <span>Revisar dúvidas</span>
                <span className="relative inline-flex h-5 w-9">
                  <input
                    type="checkbox"
                    checked={onlyNeedsReview}
                    onChange={(e) => setOnlyNeedsReview(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-full bg-zinc-800 transition peer-checked:bg-white/90" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-zinc-200 transition peer-checked:translate-x-4 peer-checked:bg-black" />
                </span>
              </label>

              <label className="flex items-center justify-between text-sm text-zinc-300">
                <span>Imagens quebradas</span>
                <span className="relative inline-flex h-5 w-9">
                  <input
                    type="checkbox"
                    checked={onlyBrokenImages}
                    onChange={(e) => setOnlyBrokenImages(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-full bg-zinc-800 transition peer-checked:bg-white/90" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-zinc-200 transition peer-checked:translate-x-4 peer-checked:bg-black" />
                </span>
              </label>
            </div>

            <button
              onClick={checkBrokenImages}
              disabled={checkingThumbs}
              className="mt-4 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700 disabled:opacity-60"
            >
              {checkingThumbs ? "Verificando…" : "Verificar imagens"}
            </button>

            <button
              onClick={saveAll}
              disabled={saveState === "saving"}
              className={[
                "mt-3 w-full rounded-xl border px-3 py-2 text-sm transition disabled:opacity-60",
                saveBtnClass,
              ].join(" ")}
            >
              {saveBtnLabel}
            </button>

            <button
              onClick={logout}
              className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
            >
              Sair
            </button>
          </div>
        </aside>

        <div>
          {/* CONTENT - GRID */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pagedItems.map((i) => {
              const isOpen = openId === i.id;
              const k = normalizeUrl(i.url);
              const dup = k && (duplicateMap.get(k) ?? 0) >= 2;
              const brokenThumb = brokenThumbs[i.id];

              return (
                <div
                  key={i.id}
                  className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/20"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : i.id)}
                    className="group block w-full text-left"
                    title="Clique para editar"
                  >
                    <div className="aspect-[16/10] w-full bg-zinc-950 relative overflow-hidden">
                      {i.thumbnailUrl ? (
                        isVideoUrl(i.thumbnailUrl) ? (
                          <VideoThumb
                            src={i.thumbnailUrl}
                            className="h-full w-full object-cover transition group-hover:scale-[1.01]"
                          />
                        ) : isVimeoUrl(i.thumbnailUrl) ? (
                          <iframe
                            src={getVimeoEmbedSrc(i.thumbnailUrl)}
                            title=""
                            allow="autoplay; fullscreen; picture-in-picture"
                            loading="lazy"
                            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                            style={{
                              width: "112%",
                              height: "100%",
                              minWidth: "100%",
                              minHeight: "100%",
                            }}
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={i.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            fetchPriority="low"
                            onError={() => setBrokenThumbState(i.id, true)}
                            onLoad={() => setBrokenThumbState(i.id, false)}
                            className="h-full w-full object-cover transition group-hover:scale-[1.01]"
                          />
                        )
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                          sem imagem
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-medium">{i.name}</div>
                          <div className="mt-1 truncate text-xs text-zinc-400">{i.url}</div>
                        </div>

                        <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300">
                          {normalizeMacro(i.macroType) || "—"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "rounded-full border px-2 py-1 text-[11px]",
                            i.reviewedAt
                              ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-200"
                              : "border-zinc-800 bg-zinc-950 text-zinc-300",
                          ].join(" ")}
                        >
                          {i.reviewedAt ? "revisado" : "pendente"}
                        </span>

                        {brokenThumb ? (
                          <span className="rounded-full border border-red-700/60 bg-red-950/30 px-2 py-1 text-[11px] text-red-200">
                            imagem quebrada
                          </span>
                        ) : null}

                        {hasActiveReviewFlags(i) ? (
                          <span className="rounded-full border border-amber-700/60 bg-amber-950/25 px-2 py-1 text-[11px] text-amber-200">
                            revisar
                          </span>
                        ) : null}

                        {dup ? (
                          <span className="rounded-full border border-amber-700/60 bg-amber-950/25 px-2 py-1 text-[11px] text-amber-200">
                            duplicado
                          </span>
                        ) : null}
                        {i.hidden ? (
                          <span className="rounded-full border border-zinc-700/60 bg-zinc-900/40 px-2 py-1 text-[11px] text-zinc-200">
                            oculto
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 text-sm text-zinc-400">
                        {i.areaPrimary ? i.areaPrimary : "—"}
                        {i.areasSecondary?.length ? (
                          <span className="text-zinc-500"> · {i.areasSecondary.join(" · ")}</span>
                        ) : null}
                      </div>
                    </div>
                  </button>

                  <div className="px-4 pb-4">
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => openUrl(i.url)}
                        aria-label="Abrir"
                        title="Abrir"
                        className="group flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 transition hover:border-zinc-200 hover:bg-white"
                      >
                        <span
                          className="h-5 w-5 bg-white transition group-hover:bg-black"
                          style={{
                            WebkitMaskImage: "url(/icons/admin/abrir.svg)",
                            maskImage: "url(/icons/admin/abrir.svg)",
                            WebkitMaskRepeat: "no-repeat",
                            maskRepeat: "no-repeat",
                            WebkitMaskPosition: "center",
                            maskPosition: "center",
                            WebkitMaskSize: "contain",
                            maskSize: "contain",
                          }}
                        />
                      </button>

                      <button
                        onClick={() => markReviewed(i.id)}
                        aria-label="Revisado"
                        title="Revisado"
                        className="group flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 transition hover:border-zinc-200 hover:bg-white"
                      >
                        <span
                          className="h-5 w-5 bg-white transition group-hover:bg-black"
                          style={{
                            WebkitMaskImage: "url(/icons/admin/revisado.svg)",
                            maskImage: "url(/icons/admin/revisado.svg)",
                            WebkitMaskRepeat: "no-repeat",
                            maskRepeat: "no-repeat",
                            WebkitMaskPosition: "center",
                            maskPosition: "center",
                            WebkitMaskSize: "contain",
                            maskSize: "contain",
                          }}
                        />
                      </button>

                      <button
                        onClick={() => updateItem(i.id, { hidden: !i.hidden })}
                        aria-label={i.hidden ? "Mostrar" : "Ocultar"}
                        title={i.hidden ? "Mostrar" : "Ocultar"}
                        className="group flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 transition hover:border-zinc-200 hover:bg-white"
                      >
                        <span
                          className="h-5 w-5 bg-white transition group-hover:bg-black"
                          style={{
                            WebkitMaskImage: "url(/icons/admin/ocultar.svg)",
                            maskImage: "url(/icons/admin/ocultar.svg)",
                            WebkitMaskRepeat: "no-repeat",
                            maskRepeat: "no-repeat",
                            WebkitMaskPosition: "center",
                            maskPosition: "center",
                            WebkitMaskSize: "contain",
                            maskSize: "contain",
                          }}
                        />
                      </button>

                      <button
                        onClick={() => confirmRemove(i)}
                        aria-label="Excluir"
                        title="Excluir"
                        className="group flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 transition hover:border-zinc-200 hover:bg-white"
                      >
                        <span
                          className="h-5 w-5 bg-white transition group-hover:bg-black"
                          style={{
                            WebkitMaskImage: "url(/icons/admin/excluir.svg)",
                            maskImage: "url(/icons/admin/excluir.svg)",
                            WebkitMaskRepeat: "no-repeat",
                            maskRepeat: "no-repeat",
                            WebkitMaskPosition: "center",
                            maskPosition: "center",
                            WebkitMaskSize: "contain",
                            maskSize: "contain",
                          }}
                        />
                      </button>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="border-t border-zinc-800 bg-zinc-950/30 p-4">
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="text-xs text-zinc-400">Nome</label>
                          <input
                            value={i.name ?? ""}
                            onChange={(e) => updateItem(i.id, { name: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400">URL</label>
                          <input
                            value={i.url ?? ""}
                            onChange={(e) => updateItem(i.id, { url: e.target.value })}
                            placeholder="https://..."
                            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                          />
                        </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs text-zinc-400">Categoria (macro)</label>
                          <select
                            value={normalizeMacro(i.macroType ?? "Designers")}
                            onChange={(e) => updateItem(i.id, { macroType: e.target.value })}
                            className="mt-1 w-full min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 pr-8 text-sm"
                            style={{ textOverflow: "ellipsis" }}
                          >
                            {MACROS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400">Área principal</label>
                          <div className="relative mt-1">
                            <input
                              value={primaryAreaDraft[i.id] ?? i.areaPrimary ?? ""}
                              onChange={(e) => {
                                setPrimaryAreaDraft((prev) => ({ ...prev, [i.id]: e.target.value }));
                                setPrimaryAreaSuggestOpenId(i.id);
                                setPrimaryAreaSuggestIndex(0);
                              }}
                              onFocus={() => {
                                setPrimaryAreaSuggestOpenId(i.id);
                                setPrimaryAreaSuggestIndex(0);
                              }}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  commitPrimaryAreaDraft(i.id, primaryAreaDraft[i.id] ?? i.areaPrimary ?? "");
                                  setPrimaryAreaSuggestOpenId((prev) => (prev === i.id ? null : prev));
                                }, 120);
                              }}
                              onKeyDown={(e) => {
                                const suggestions = getPrimaryAreaSuggestions(
                                  primaryAreaDraft[i.id] ?? i.areaPrimary ?? ""
                                );
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  if (!suggestions.length) return;
                                  setPrimaryAreaSuggestOpenId(i.id);
                                  setPrimaryAreaSuggestIndex((idx) =>
                                    idx + 1 >= suggestions.length ? 0 : idx + 1
                                  );
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  if (!suggestions.length) return;
                                  setPrimaryAreaSuggestOpenId(i.id);
                                  setPrimaryAreaSuggestIndex((idx) =>
                                    idx - 1 < 0 ? suggestions.length - 1 : idx - 1
                                  );
                                  return;
                                }
                                if (e.key === "Tab") {
                                  if (!suggestions.length) return;
                                  const pick =
                                    suggestions[Math.min(primaryAreaSuggestIndex, suggestions.length - 1)];
                                  setPrimaryAreaDraft((prev) => ({ ...prev, [i.id]: pick }));
                                  commitPrimaryAreaDraft(i.id, pick);
                                  setPrimaryAreaSuggestOpenId(null);
                                  setPrimaryAreaSuggestIndex(0);
                                  return;
                                }
                                if (e.key === "Enter") {
                                  if (!suggestions.length) return;
                                  e.preventDefault();
                                  const pick =
                                    suggestions[Math.min(primaryAreaSuggestIndex, suggestions.length - 1)];
                                  setPrimaryAreaDraft((prev) => ({ ...prev, [i.id]: pick }));
                                  commitPrimaryAreaDraft(i.id, pick);
                                  setPrimaryAreaSuggestOpenId(null);
                                  setPrimaryAreaSuggestIndex(0);
                                  return;
                                }
                                if (e.key === "Escape") {
                                  setPrimaryAreaSuggestOpenId(null);
                                }
                              }}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                            />
                            {primaryAreaSuggestOpenId === i.id ? (
                              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
                                {getPrimaryAreaSuggestions(primaryAreaDraft[i.id] ?? i.areaPrimary ?? "").length ? (
                                  getPrimaryAreaSuggestions(
                                    primaryAreaDraft[i.id] ?? i.areaPrimary ?? ""
                                  ).map((option, idx) => (
                                    <button
                                      key={`${i.id}-primary-${option}`}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setPrimaryAreaDraft((prev) => ({ ...prev, [i.id]: option }));
                                        commitPrimaryAreaDraft(i.id, option);
                                        setPrimaryAreaSuggestOpenId(null);
                                        setPrimaryAreaSuggestIndex(0);
                                      }}
                                      className={[
                                        "w-full px-3 py-2 text-left text-sm transition",
                                        idx === primaryAreaSuggestIndex
                                          ? "bg-zinc-800 text-zinc-100"
                                          : "text-zinc-300 hover:bg-zinc-900",
                                      ].join(" ")}
                                    >
                                      {option}
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-3 py-2 text-sm text-zinc-500">
                                    Nenhuma sugestão
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-zinc-400">Áreas secundárias (até 4)</label>
                        <div className="relative mt-1">
                          <input
                            value={secondaryDraft[i.id] ?? ""}
                            onChange={(e) => {
                              const nextDraft = enforceSecondaryDraftLimit(e.target.value);
                              setSecondaryDraft((prev) => ({ ...prev, [i.id]: nextDraft }));
                              setSecondarySuggestOpenId(i.id);
                              setSecondarySuggestIndex(0);
                            }}
                            onFocus={() => {
                              setSecondarySuggestOpenId(i.id);
                              setSecondarySuggestIndex(0);
                            }}
                            onBlur={() => {
                              window.setTimeout(() => {
                                applySecondaryAreas(i.id, i.areaPrimary, secondaryDraft[i.id] ?? "");
                                setSecondarySuggestOpenId((prev) => (prev === i.id ? null : prev));
                              }, 120);
                            }}
                            onKeyDown={(e) => {
                              const suggestions = getSecondarySuggestions(secondaryDraft[i.id] ?? "");
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                if (!suggestions.length) return;
                                setSecondarySuggestOpenId(i.id);
                                setSecondarySuggestIndex((idx) =>
                                  idx + 1 >= suggestions.length ? 0 : idx + 1
                                );
                                return;
                              }
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                if (!suggestions.length) return;
                                setSecondarySuggestOpenId(i.id);
                                setSecondarySuggestIndex((idx) =>
                                  idx - 1 < 0 ? suggestions.length - 1 : idx - 1
                                );
                                return;
                              }
                              if (e.key === "Tab") {
                                if (!suggestions.length) return;
                                const pick =
                                  suggestions[Math.min(secondarySuggestIndex, suggestions.length - 1)];
                                const current = secondaryDraft[i.id] ?? "";
                                if (parseSecondaryFromInput(current).values.length >= 4) return;
                                const next = enforceSecondaryDraftLimit(
                                  applySecondarySuggestion(
                                    current,
                                    pick
                                  )
                                );
                                setSecondaryDraft((prev) => ({ ...prev, [i.id]: next }));
                                applySecondaryAreas(i.id, i.areaPrimary, next);
                                setSecondarySuggestOpenId(null);
                                setSecondarySuggestIndex(0);
                                return;
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (suggestions.length && secondarySuggestOpenId === i.id) {
                                  const pick =
                                    suggestions[Math.min(secondarySuggestIndex, suggestions.length - 1)];
                                  const current = secondaryDraft[i.id] ?? "";
                                  if (parseSecondaryFromInput(current).values.length >= 4) return;
                                  const next = enforceSecondaryDraftLimit(
                                    applySecondarySuggestion(
                                      current,
                                      pick
                                    )
                                  );
                                  setSecondaryDraft((prev) => ({ ...prev, [i.id]: next }));
                                  setSecondarySuggestIndex(0);
                                  return;
                                }
                                applySecondaryAreas(i.id, i.areaPrimary, secondaryDraft[i.id] ?? "");
                                setSecondarySuggestOpenId(null);
                                return;
                              }
                              if (e.key === "Escape") {
                                setSecondarySuggestOpenId(null);
                              }
                            }}
                            placeholder="Ex: Moda Beleza Tipografia"
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                          />
                          {secondarySuggestOpenId === i.id ? (
                            <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
                              {getSecondarySuggestions(secondaryDraft[i.id] ?? "").length ? (
                                getSecondarySuggestions(secondaryDraft[i.id] ?? "").map(
                                  (option, idx) => (
                                    <button
                                      key={`${i.id}-${option}`}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        const current = secondaryDraft[i.id] ?? "";
                                        if (parseSecondaryFromInput(current).values.length >= 4) return;
                                        const next = enforceSecondaryDraftLimit(
                                          applySecondarySuggestion(
                                            current,
                                            option
                                          )
                                        );
                                        setSecondaryDraft((prev) => ({ ...prev, [i.id]: next }));
                                        setSecondarySuggestIndex(0);
                                      }}
                                      className={[
                                        "w-full px-3 py-2 text-left text-sm transition",
                                        idx === secondarySuggestIndex
                                          ? "bg-zinc-800 text-zinc-100"
                                          : "text-zinc-300 hover:bg-zinc-900",
                                      ].join(" ")}
                                    >
                                      {option}
                                    </button>
                                  )
                                )
                              ) : (
                                <div className="px-3 py-2 text-sm text-zinc-500">
                                  Nenhuma sugestão
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          Dica: digite e use Tab/Setas/Enter para completar. Espaço separa categorias.
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs text-zinc-400">País</label>
                          <div className="relative mt-1">
                            <input
                              value={countryDraft[i.id] ?? i.country ?? ""}
                              autoComplete="new-password"
                              autoCorrect="off"
                              spellCheck={false}
                              onChange={(e) => {
                                setCountryDraft((prev) => ({ ...prev, [i.id]: e.target.value }));
                                setCountrySuggestOpenId(i.id);
                                setCountrySuggestIndex(0);
                              }}
                              onFocus={() => {
                                setCountrySuggestOpenId(i.id);
                                setCountrySuggestIndex(0);
                              }}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  commitCountryDraft(i.id, countryDraft[i.id] ?? i.country ?? "");
                                  setCountrySuggestOpenId((prev) => (prev === i.id ? null : prev));
                                }, 120);
                              }}
                              onKeyDown={(e) => {
                                const suggestions = getLocationSuggestions(
                                  countryDraft[i.id] ?? i.country ?? "",
                                  countryOptions,
                                  normalizeCountryValue
                                );
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  if (!suggestions.length) return;
                                  setCountrySuggestOpenId(i.id);
                                  setCountrySuggestIndex((idx) =>
                                    idx + 1 >= suggestions.length ? 0 : idx + 1
                                  );
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  if (!suggestions.length) return;
                                  setCountrySuggestOpenId(i.id);
                                  setCountrySuggestIndex((idx) =>
                                    idx - 1 < 0 ? suggestions.length - 1 : idx - 1
                                  );
                                  return;
                                }
                                if (e.key === "Tab") {
                                  if (!suggestions.length) return;
                                  const pick =
                                    suggestions[Math.min(countrySuggestIndex, suggestions.length - 1)];
                                  setCountryDraft((prev) => ({ ...prev, [i.id]: pick }));
                                  commitCountryDraft(i.id, pick);
                                  setCountrySuggestOpenId(null);
                                  setCountrySuggestIndex(0);
                                  return;
                                }
                                if (e.key === "Enter") {
                                  if (!suggestions.length) return;
                                  e.preventDefault();
                                  const pick =
                                    suggestions[Math.min(countrySuggestIndex, suggestions.length - 1)];
                                  setCountryDraft((prev) => ({ ...prev, [i.id]: pick }));
                                  commitCountryDraft(i.id, pick);
                                  setCountrySuggestOpenId(null);
                                  setCountrySuggestIndex(0);
                                  return;
                                }
                                if (e.key === "Escape") {
                                  setCountrySuggestOpenId(null);
                                }
                              }}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                            />
                            {countrySuggestOpenId === i.id ? (
                              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
                                {getLocationSuggestions(
                                  countryDraft[i.id] ?? i.country ?? "",
                                  countryOptions,
                                  normalizeCountryValue
                                ).length ? (
                                  getLocationSuggestions(
                                    countryDraft[i.id] ?? i.country ?? "",
                                    countryOptions,
                                    normalizeCountryValue
                                  ).map((option, idx) => (
                                    <button
                                      key={`${i.id}-country-${option}`}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setCountryDraft((prev) => ({ ...prev, [i.id]: option }));
                                        commitCountryDraft(i.id, option);
                                        setCountrySuggestOpenId(null);
                                        setCountrySuggestIndex(0);
                                      }}
                                      className={[
                                        "w-full px-3 py-2 text-left text-sm transition",
                                        idx === countrySuggestIndex
                                          ? "bg-zinc-800 text-zinc-100"
                                          : "text-zinc-300 hover:bg-zinc-900",
                                      ].join(" ")}
                                    >
                                      {option}
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-3 py-2 text-sm text-zinc-500">
                                    Nenhuma sugestão
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400">Cidade</label>
                          <div className="relative mt-1">
                            <input
                              value={cityDraft[i.id] ?? i.city ?? ""}
                              autoComplete="new-password"
                              autoCorrect="off"
                              spellCheck={false}
                              onChange={(e) => {
                                setCityDraft((prev) => ({ ...prev, [i.id]: e.target.value }));
                                setCitySuggestOpenId(i.id);
                                setCitySuggestIndex(0);
                              }}
                              onFocus={() => {
                                setCitySuggestOpenId(i.id);
                                setCitySuggestIndex(0);
                              }}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  commitCityDraft(i.id, cityDraft[i.id] ?? i.city ?? "");
                                  setCitySuggestOpenId((prev) => (prev === i.id ? null : prev));
                                }, 120);
                              }}
                              onKeyDown={(e) => {
                                const suggestions = getLocationSuggestions(
                                  cityDraft[i.id] ?? i.city ?? "",
                                  cityOptions,
                                  normalizeCityValue
                                );
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  if (!suggestions.length) return;
                                  setCitySuggestOpenId(i.id);
                                  setCitySuggestIndex((idx) =>
                                    idx + 1 >= suggestions.length ? 0 : idx + 1
                                  );
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  if (!suggestions.length) return;
                                  setCitySuggestOpenId(i.id);
                                  setCitySuggestIndex((idx) =>
                                    idx - 1 < 0 ? suggestions.length - 1 : idx - 1
                                  );
                                  return;
                                }
                                if (e.key === "Tab") {
                                  if (!suggestions.length) return;
                                  const pick =
                                    suggestions[Math.min(citySuggestIndex, suggestions.length - 1)];
                                  setCityDraft((prev) => ({ ...prev, [i.id]: pick }));
                                  commitCityDraft(i.id, pick);
                                  setCitySuggestOpenId(null);
                                  setCitySuggestIndex(0);
                                  return;
                                }
                                if (e.key === "Enter") {
                                  if (!suggestions.length) return;
                                  e.preventDefault();
                                  const pick =
                                    suggestions[Math.min(citySuggestIndex, suggestions.length - 1)];
                                  setCityDraft((prev) => ({ ...prev, [i.id]: pick }));
                                  commitCityDraft(i.id, pick);
                                  setCitySuggestOpenId(null);
                                  setCitySuggestIndex(0);
                                  return;
                                }
                                if (e.key === "Escape") {
                                  setCitySuggestOpenId(null);
                                }
                              }}
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                            />
                            {citySuggestOpenId === i.id ? (
                              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
                                {getLocationSuggestions(
                                  cityDraft[i.id] ?? i.city ?? "",
                                  cityOptions,
                                  normalizeCityValue
                                ).length ? (
                                  getLocationSuggestions(
                                    cityDraft[i.id] ?? i.city ?? "",
                                    cityOptions,
                                    normalizeCityValue
                                  ).map((option, idx) => (
                                    <button
                                      key={`${i.id}-city-${option}`}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setCityDraft((prev) => ({ ...prev, [i.id]: option }));
                                        commitCityDraft(i.id, option);
                                        setCitySuggestOpenId(null);
                                        setCitySuggestIndex(0);
                                      }}
                                      className={[
                                        "w-full px-3 py-2 text-left text-sm transition",
                                        idx === citySuggestIndex
                                          ? "bg-zinc-800 text-zinc-100"
                                          : "text-zinc-300 hover:bg-zinc-900",
                                      ].join(" ")}
                                    >
                                      {option}
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-3 py-2 text-sm text-zinc-500">
                                    Nenhuma sugestão
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {((i.locations || []).slice(1)).map((row, idx) => {
                          const rowIndex = idx + 1;
                          const countryFieldKey = `${i.id}:${rowIndex}:country`;
                          const cityFieldKey = `${i.id}:${rowIndex}:city`;
                          return (
                            <div
                              key={`${i.id}-location-${rowIndex}`}
                              className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
                            >
                              <div>
                                <div className="relative">
                                  <input
                                    value={locationDraft[countryFieldKey] ?? row?.country ?? ""}
                                    placeholder="País adicional"
                                    autoComplete="new-password"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    onChange={(e) => {
                                      setLocationDraft((prev) => ({
                                        ...prev,
                                        [countryFieldKey]: e.target.value,
                                      }));
                                      setLocationSuggestOpenKey(countryFieldKey);
                                      setLocationSuggestIndex(0);
                                    }}
                                    onFocus={() => {
                                      setLocationSuggestOpenKey(countryFieldKey);
                                      setLocationSuggestIndex(0);
                                    }}
                                    onBlur={() => {
                                      window.setTimeout(() => {
                                        commitLocationDraft(
                                          i.id,
                                          rowIndex,
                                          "country",
                                          locationDraft[countryFieldKey] ?? row?.country ?? ""
                                        );
                                        setLocationSuggestOpenKey((prev) =>
                                          prev === countryFieldKey ? null : prev
                                        );
                                      }, 120);
                                    }}
                                    onKeyDown={(e) => {
                                      const suggestions = getLocationSuggestions(
                                        locationDraft[countryFieldKey] ?? row?.country ?? "",
                                        countryOptions,
                                        normalizeCountryValue
                                      );
                                      if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        if (!suggestions.length) return;
                                        setLocationSuggestOpenKey(countryFieldKey);
                                        setLocationSuggestIndex((s) =>
                                          s + 1 >= suggestions.length ? 0 : s + 1
                                        );
                                        return;
                                      }
                                      if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        if (!suggestions.length) return;
                                        setLocationSuggestOpenKey(countryFieldKey);
                                        setLocationSuggestIndex((s) =>
                                          s - 1 < 0 ? suggestions.length - 1 : s - 1
                                        );
                                        return;
                                      }
                                      if (e.key === "Tab") {
                                        if (!suggestions.length) return;
                                        const pick =
                                          suggestions[Math.min(locationSuggestIndex, suggestions.length - 1)];
                                        setLocationDraft((prev) => ({ ...prev, [countryFieldKey]: pick }));
                                        commitLocationDraft(i.id, rowIndex, "country", pick);
                                        setLocationSuggestOpenKey(null);
                                        setLocationSuggestIndex(0);
                                        return;
                                      }
                                      if (e.key === "Enter") {
                                        if (!suggestions.length) return;
                                        e.preventDefault();
                                        const pick =
                                          suggestions[Math.min(locationSuggestIndex, suggestions.length - 1)];
                                        setLocationDraft((prev) => ({ ...prev, [countryFieldKey]: pick }));
                                        commitLocationDraft(i.id, rowIndex, "country", pick);
                                        setLocationSuggestOpenKey(null);
                                        setLocationSuggestIndex(0);
                                        return;
                                      }
                                      if (e.key === "Escape") {
                                        setLocationSuggestOpenKey(null);
                                      }
                                    }}
                                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                                  />
                                  {locationSuggestOpenKey === countryFieldKey ? (
                                    <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
                                      {getLocationSuggestions(
                                        locationDraft[countryFieldKey] ?? row?.country ?? "",
                                        countryOptions,
                                        normalizeCountryValue
                                      ).length ? (
                                        getLocationSuggestions(
                                          locationDraft[countryFieldKey] ?? row?.country ?? "",
                                          countryOptions,
                                          normalizeCountryValue
                                        ).map((option, optionIdx) => (
                                          <button
                                            key={`${countryFieldKey}-${option}`}
                                            type="button"
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              setLocationDraft((prev) => ({
                                                ...prev,
                                                [countryFieldKey]: option,
                                              }));
                                              commitLocationDraft(i.id, rowIndex, "country", option);
                                              setLocationSuggestOpenKey(null);
                                              setLocationSuggestIndex(0);
                                            }}
                                            className={[
                                              "w-full px-3 py-2 text-left text-sm transition",
                                              optionIdx === locationSuggestIndex
                                                ? "bg-zinc-800 text-zinc-100"
                                                : "text-zinc-300 hover:bg-zinc-900",
                                            ].join(" ")}
                                          >
                                            {option}
                                          </button>
                                        ))
                                      ) : (
                                        <div className="px-3 py-2 text-sm text-zinc-500">
                                          Nenhuma sugestão
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div>
                                <div className="relative">
                                  <input
                                    value={locationDraft[cityFieldKey] ?? row?.city ?? ""}
                                    placeholder="Cidade adicional"
                                    autoComplete="new-password"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    onChange={(e) => {
                                      setLocationDraft((prev) => ({
                                        ...prev,
                                        [cityFieldKey]: e.target.value,
                                      }));
                                      setLocationSuggestOpenKey(cityFieldKey);
                                      setLocationSuggestIndex(0);
                                    }}
                                    onFocus={() => {
                                      setLocationSuggestOpenKey(cityFieldKey);
                                      setLocationSuggestIndex(0);
                                    }}
                                    onBlur={() => {
                                      window.setTimeout(() => {
                                        commitLocationDraft(
                                          i.id,
                                          rowIndex,
                                          "city",
                                          locationDraft[cityFieldKey] ?? row?.city ?? ""
                                        );
                                        setLocationSuggestOpenKey((prev) =>
                                          prev === cityFieldKey ? null : prev
                                        );
                                      }, 120);
                                    }}
                                    onKeyDown={(e) => {
                                      const suggestions = getLocationSuggestions(
                                        locationDraft[cityFieldKey] ?? row?.city ?? "",
                                        cityOptions,
                                        normalizeCityValue
                                      );
                                      if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        if (!suggestions.length) return;
                                        setLocationSuggestOpenKey(cityFieldKey);
                                        setLocationSuggestIndex((s) =>
                                          s + 1 >= suggestions.length ? 0 : s + 1
                                        );
                                        return;
                                      }
                                      if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        if (!suggestions.length) return;
                                        setLocationSuggestOpenKey(cityFieldKey);
                                        setLocationSuggestIndex((s) =>
                                          s - 1 < 0 ? suggestions.length - 1 : s - 1
                                        );
                                        return;
                                      }
                                      if (e.key === "Tab") {
                                        if (!suggestions.length) return;
                                        const pick =
                                          suggestions[Math.min(locationSuggestIndex, suggestions.length - 1)];
                                        setLocationDraft((prev) => ({ ...prev, [cityFieldKey]: pick }));
                                        commitLocationDraft(i.id, rowIndex, "city", pick);
                                        setLocationSuggestOpenKey(null);
                                        setLocationSuggestIndex(0);
                                        return;
                                      }
                                      if (e.key === "Enter") {
                                        if (!suggestions.length) return;
                                        e.preventDefault();
                                        const pick =
                                          suggestions[Math.min(locationSuggestIndex, suggestions.length - 1)];
                                        setLocationDraft((prev) => ({ ...prev, [cityFieldKey]: pick }));
                                        commitLocationDraft(i.id, rowIndex, "city", pick);
                                        setLocationSuggestOpenKey(null);
                                        setLocationSuggestIndex(0);
                                        return;
                                      }
                                      if (e.key === "Escape") {
                                        setLocationSuggestOpenKey(null);
                                      }
                                    }}
                                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                                  />
                                  {locationSuggestOpenKey === cityFieldKey ? (
                                    <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
                                      {getLocationSuggestions(
                                        locationDraft[cityFieldKey] ?? row?.city ?? "",
                                        cityOptions,
                                        normalizeCityValue
                                      ).length ? (
                                        getLocationSuggestions(
                                          locationDraft[cityFieldKey] ?? row?.city ?? "",
                                          cityOptions,
                                          normalizeCityValue
                                        ).map((option, optionIdx) => (
                                          <button
                                            key={`${cityFieldKey}-${option}`}
                                            type="button"
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              setLocationDraft((prev) => ({
                                                ...prev,
                                                [cityFieldKey]: option,
                                              }));
                                              commitLocationDraft(i.id, rowIndex, "city", option);
                                              setLocationSuggestOpenKey(null);
                                              setLocationSuggestIndex(0);
                                            }}
                                            className={[
                                              "w-full px-3 py-2 text-left text-sm transition",
                                              optionIdx === locationSuggestIndex
                                                ? "bg-zinc-800 text-zinc-100"
                                                : "text-zinc-300 hover:bg-zinc-900",
                                            ].join(" ")}
                                          >
                                            {option}
                                          </button>
                                        ))
                                      ) : (
                                        <div className="px-3 py-2 text-sm text-zinc-500">
                                          Nenhuma sugestão
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="pt-2 sm:pt-2">
                                <button
                                  type="button"
                                  onClick={() => removeLocationRow(i.id, rowIndex)}
                                  className="text-[11px] text-zinc-500 underline hover:text-zinc-300"
                                >
                                  remover
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        <div className="sm:col-span-2">
                          <button
                            type="button"
                            onClick={() => addLocationRow(i.id)}
                            className="mb-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                          >
                            + Adicionar país e cidade
                          </button>
                          <div className="mb-2 text-[11px] text-zinc-500">
                            Dica: use Tab/Setas/Enter para autocompletar país e cidade.
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-zinc-400">Thumbnail</label>
                        <input
                          value={i.thumbnailUrl ?? ""}
                          onChange={(e) =>
                            updateItem(i.id, {
                              thumbnailUrl: e.target.value || null,
                              thumbnailSource: "manual",
                            })
                          }
                          placeholder="https://..."
                          className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                        />
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <button
                            onClick={() => openThumbPicker(i.id, i.url)}
                            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                          >
                            Escolher
                          </button>

                          <label className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700 cursor-pointer text-center">
                            {uploadingId === i.id ? "Enviando…" : "Upload"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingId === i.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadThumbnail(i.id, file);
                                e.currentTarget.value = "";
                              }}
                            />
                          </label>

                          <button
                            onClick={() => downloadThumbnail(i.thumbnailUrl || "", i.name || "thumbnail")}
                            disabled={!i.thumbnailUrl}
                            className={[
                              "rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700",
                              i.thumbnailUrl ? "cursor-pointer" : "cursor-not-allowed text-zinc-400 opacity-60",
                            ].join(" ")}
                          >
                            Download
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-zinc-500">
                        Revisado em: {i.reviewedAt ? new Date(i.reviewedAt).toLocaleString() : "—"}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Página {safeCurrentPage} de {totalPages} • {filtered.length} itens
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="rounded-none border border-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="rounded-none border border-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
