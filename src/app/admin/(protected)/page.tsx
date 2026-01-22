"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

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

  thumbnailUrl?: string | null;
  thumbnailSource?: string | null;

  updatedAt?: string | null;
  reviewedAt?: string | null;

  reviewFlags?: {
    country?: boolean;
    city?: boolean;
  };
};

const MACROS = ["Studios", "Designers", "Photographers", "Illustrators", "Foundries"] as const;

type SaveState = "idle" | "saving" | "saved" | "error";

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

function parseSecondary(text: string) {
  const arr = (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return uniq(arr);
}

function normalizeSecondaryAreas(primary: string | null | undefined, secondary: string[] | undefined) {
  const primaryCanon = (primary ?? "").trim().toLowerCase();
  const base = (secondary ?? []).map((s) => s.trim()).filter(Boolean);
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

type ThumbModalState = {
  open: boolean;
  itemId: string | null;
  baseUrl: string;
  loading: boolean;
  error: string;
  candidates: string[];
};

export default function AdminPage() {
  const [items, setItems] = useState<RefItem[]>([]);
  const [q, setQ] = useState("");
  const [onlyNoImage, setOnlyNoImage] = useState(false);
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false);
  const [onlyBrokenImages, setOnlyBrokenImages] = useState(false);
  const [macroFilter, setMacroFilter] = useState<string>("Todos");

  const [openId, setOpenId] = useState<string | null>(null);
  const [secondaryDraft, setSecondaryDraft] = useState<Record<string, string>>({});
  const [secondaryInput, setSecondaryInput] = useState<Record<string, string>>({});

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [autoSavePending, setAutoSavePending] = useState(false);
  const [autoSaveActive, setAutoSaveActive] = useState(false);
  const [checkingThumbs, setCheckingThumbs] = useState(false);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});
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

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/references");
      const db = await res.json();
      const loaded: RefItem[] = db.items ?? [];

      // normaliza macroType (corrige “Studio” etc) ao carregar
      const normalized = loaded.map((it) => {
        const macroType = normalizeMacro(
          getStringField(it, "macroType") || getStringField(it, "macro")
        );
        const ap = (it.areaPrimary ?? "") as string;
        const as = normalizeSecondaryAreas(ap, (it.areasSecondary ?? []) as string[]);
        return {
          ...it,
          macroType,
          areasSecondary: as,
          tags: deriveTags(ap, as),
        };
      });

      setItems(normalized);

      const draft: Record<string, string> = {};
      for (const it of normalized) draft[it.id] = (it.areasSecondary ?? []).join(", ");
      setSecondaryDraft(draft);
    })();
  }, []);

  const duplicateMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const k = normalizeUrl(it.url);
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [items]);

  async function checkBrokenImages() {
    const candidates = items
      .filter((i) => (i.thumbnailUrl || "").trim())
      .map((i) => ({ id: i.id, url: (i.thumbnailUrl || "").trim() }));

    if (!candidates.length) {
      showToast("Nenhuma imagem para verificar");
      return;
    }

    setCheckingThumbs(true);
    setBrokenThumbs({});
    showToast("Verificando imagens…");

    const queue = [...candidates];
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
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const result = await next();
        if (!result) break;
        setBrokenThumbs((prev) => ({ ...prev, [result.id]: !result.ok }));
        if (!result.ok) brokenCount += 1;
      }
    });

    await Promise.all(workers);

    setCheckingThumbs(false);
    showToast(
      brokenCount
        ? `${brokenCount} imagem(ns) com problema`
        : "Nenhuma imagem quebrada encontrada"
    );
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return items.filter((i) => {
      if (macroFilter !== "Todos" && i.macroType !== macroFilter) return false;
      if (onlyNoImage && i.thumbnailUrl) return false;
      if (onlyBrokenImages && !brokenThumbs[i.id]) return false;
      if (onlyUnreviewed && i.reviewedAt) return false;
      if (onlyNeedsReview && !i.reviewFlags) return false;

      if (onlyDuplicates) {
        const k = normalizeUrl(i.url);
        if (!k) return false;
        if ((duplicateMap.get(k) ?? 0) < 2) return false;
      }

      if (!query) return true;

      const hay = [
        i.name,
        i.url,
        i.macroType,
        i.areaPrimary ?? "",
        (i.areasSecondary ?? []).join(" "),
        i.country ?? "",
        i.city ?? "",
        i.reviewedAt ? "revisado" : "nao revisado",
        i.reviewFlags ? "revisar" : "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [
    items,
    q,
    onlyNoImage,
    onlyBrokenImages,
    onlyUnreviewed,
    onlyDuplicates,
    onlyNeedsReview,
    macroFilter,
    duplicateMap,
    brokenThumbs,
  ]);

  const areaMap = useMemo(() => buildAreaMap(items), [items]);
  const areaOptions = useMemo(() => {
    return Array.from(new Set(areaMap.values())).sort((a, b) => a.localeCompare(b));
  }, [areaMap]);

  function updateItem(id: string, patch: Partial<RefItem>) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;

        const next: RefItem = { ...i, ...patch, updatedAt: new Date().toISOString() };

        // normaliza macroType sempre que mexer (evita “Studio” solto)
        next.macroType = normalizeMacro(next.macroType);

        const ap = (next.areaPrimary ?? "") as string;
        const as = normalizeSecondaryAreas(ap, (next.areasSecondary ?? []) as string[]);
        next.areasSecondary = as;
        next.tags = deriveTags(ap, as);

        // se estava "Salvo ✓", volta para idle quando muda algo
        setSaveState((s) => (s === "saved" ? "idle" : s));
        setSaveMessage((m) => (saveState === "saved" ? "" : m));

        return next;
      })
    );
  }

  function normalizeAreaValue(value: string) {
    const key = (value || "").trim().toLowerCase();
    if (!key) return "";
    return areaMap.get(key) || "";
  }

  function addSecondaryArea(id: string) {
    const rawInput = secondaryInput[id] ?? "";
    const next = normalizeAreaValue(rawInput);
    if (!next) {
      if (rawInput.trim()) showToast("Área não encontrada na lista. Escolha uma sugestão.");
      return;
    }

    const current = parseSecondary(secondaryDraft[id] ?? "");
    const normalized = normalizeSecondaryAreas("", [...current, next]);
    setSecondaryDraft((prev) => ({ ...prev, [id]: normalized.join(", ") }));
    updateItem(id, { areasSecondary: normalized });
    setSecondaryInput((prev) => ({ ...prev, [id]: "" }));
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
      thumbnailUrl: null,
      thumbnailSource: "manual",
      updatedAt: now,
      reviewedAt: null,
    };

    setItems((prev) => [newItem, ...prev]);
    setSecondaryDraft((prev) => ({ ...prev, [id]: "" }));
    setOpenId(id);

    setSaveState("idle");
    setSaveMessage("");
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setOpenId((prev) => (prev === id ? null : prev));

    setSecondaryDraft((prev) => {
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
    updateItem(id, { reviewedAt: new Date().toISOString() });
    showToast("Marcado como revisado");
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
          error: "Não foi possível buscar imagens. (site bloqueou ou falha na requisição)",
        }));
        return;
      }

      const data = await res.json();
      const candidates: string[] = Array.isArray(data?.candidates) ? data.candidates : [];

      setThumbModal((s) => ({
        ...s,
        loading: false,
        candidates,
        error: candidates.length ? "" : "Nenhuma imagem encontrada nas páginas de projetos/works/portfolio.",
      }));
    } catch {
      setThumbModal((s) => ({
        ...s,
        loading: false,
        error: "Falha ao buscar imagens. Verifique conexão / URL.",
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
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-4">
      {/* TOP BAR STICKY */}
      <div className="sticky top-0 z-30 -mx-6 border-b border-zinc-800 bg-zinc-950/92 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Admin</h1>

            {saveMessage ? (
              <div
                className={[
                  "mt-2 text-xs",
                  saveState === "error" ? "text-red-300" : "text-zinc-400",
                ].join(" ")}
              >
                {saveMessage}
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
            >
              Home
            </Link>

            <button
              onClick={addNew}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
            >
              + Adicionar
            </button>

            <button
              onClick={saveAll}
              disabled={saveState === "saving"}
              className={[
                "rounded-xl border px-3 py-2 text-sm transition disabled:opacity-60",
                saveBtnClass,
              ].join(" ")}
            >
              {saveBtnLabel}
            </button>

            <button
              onClick={logout}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, url, área, país..."
            className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />

          <select
            value={macroFilter}
            onChange={(e) => setMacroFilter(e.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          >
            <option value="Todos">Todas as categorias</option>
            {MACROS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={onlyNoImage}
              onChange={(e) => setOnlyNoImage(e.target.checked)}
            />
            Somente sem imagem
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={onlyUnreviewed}
              onChange={(e) => setOnlyUnreviewed(e.target.checked)}
            />
            Somente não revisados
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={onlyDuplicates}
              onChange={(e) => setOnlyDuplicates(e.target.checked)}
            />
            Duplicados (URL)
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={onlyNeedsReview}
              onChange={(e) => setOnlyNeedsReview(e.target.checked)}
            />
            Revisar dúvidas
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={onlyBrokenImages}
              onChange={(e) => setOnlyBrokenImages(e.target.checked)}
            />
            Somente imagens quebradas
          </label>

          <button
            onClick={checkBrokenImages}
            disabled={checkingThumbs}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700 disabled:opacity-60"
          >
            {checkingThumbs ? "Verificando…" : "Verificar imagens"}
          </button>

          <div className="ml-auto text-sm text-zinc-400">{filtered.length} itens</div>
        </div>
      </div>

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
                  Buscando imagens em páginas típicas de projetos/works/portfolio.
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
                <div className="text-sm text-zinc-400">Buscando imagens…</div>
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
                      className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-left hover:border-zinc-700"
                      title="Clique para usar"
                    >
                      <div className="aspect-[4/3] w-full bg-zinc-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
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

      {/* CONTENT - GRID */}
      <div className="pt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((i) => {
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
                  <div className="aspect-[16/10] w-full bg-zinc-950">
                    {i.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={i.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-[1.01]"
                      />
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

                      {i.reviewFlags ? (
                        <span className="rounded-full border border-amber-700/60 bg-amber-950/25 px-2 py-1 text-[11px] text-amber-200">
                          revisar
                        </span>
                      ) : null}

                      {dup ? (
                        <span className="rounded-full border border-amber-700/60 bg-amber-950/25 px-2 py-1 text-[11px] text-amber-200">
                          duplicado
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openUrl(i.url)}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                    >
                      Abrir
                    </button>

                    <button
                      onClick={() => markReviewed(i.id)}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                    >
                      Revisado
                    </button>

                    <button
                      onClick={() => confirmRemove(i)}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                    >
                      Excluir
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
                            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
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
                          <input
                            value={i.areaPrimary ?? ""}
                            onChange={(e) => updateItem(i.id, { areaPrimary: e.target.value })}
                            onBlur={(e) => {
                              const next = normalizeAreaValue(e.target.value);
                              if (!next && e.target.value.trim()) {
                                showToast("Área não encontrada na lista. Escolha uma sugestão.");
                              }
                              updateItem(i.id, { areaPrimary: next || "" });
                            }}
                            list="area-options"
                            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-zinc-400">
                          Áreas secundárias (até 4, separadas por vírgula)
                        </label>
                        <input
                          value={secondaryDraft[i.id] ?? ""}
                          onChange={(e) =>
                            setSecondaryDraft((prev) => ({ ...prev, [i.id]: e.target.value }))
                          }
                          onBlur={() => {
                            const raw = parseSecondary(secondaryDraft[i.id] ?? "");
                            const normalized = raw.map((v) => normalizeAreaValue(v)).filter(Boolean);
                            if (normalized.length !== raw.length) {
                              showToast("Algumas áreas secundárias não existem na lista.");
                            }
                            const parsed = normalizeSecondaryAreas(i.areaPrimary ?? "", normalized);
                            setSecondaryDraft((prev) => ({ ...prev, [i.id]: parsed.join(", ") }));
                            updateItem(i.id, { areasSecondary: parsed });
                          }}
                          placeholder="Ex: Editorial, Digital, Tipografia, Identidade"
                          className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                        />
                        <div className="mt-1 text-[11px] text-zinc-500">
                          Dica: digite livremente e ele organiza quando você sair do campo.
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            value={secondaryInput[i.id] ?? ""}
                            onChange={(e) =>
                              setSecondaryInput((prev) => ({ ...prev, [i.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addSecondaryArea(i.id);
                              }
                            }}
                            list="area-options"
                            placeholder="Adicionar área secundária"
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => addSecondaryArea(i.id)}
                            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                          >
                            Adicionar
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  <div>
    <label className="text-xs text-zinc-400">País</label>
    <input
      value={i.country ?? ""}
      onChange={(e) => updateItem(i.id, { country: e.target.value || null })}
      className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
    />
  </div>

      <div>
        <label className="text-xs text-zinc-400">Cidade</label>
        <input
          value={i.city ?? ""}
          onChange={(e) => updateItem(i.id, { city: e.target.value || null })}
          className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>

                        <div className="sm:col-span-2">
                          <button
                            onClick={async () => {
                              const u = (i.url || "").trim();
                              if (!u) return showToast("Preencha a URL primeiro.");
                              showToast("Buscando localização…");
                              try {
                                const res = await fetch(`/api/admin/location?url=${encodeURIComponent(u)}`);
                                const data = await res.json();
                                if (data?.country || data?.city) {
                                  updateItem(i.id, { country: data.country ?? i.country ?? null, city: data.city ?? i.city ?? null });
                                  showToast("Localização sugerida");
                                } else {
                                  showToast("Não encontrei localização no site");
                                }
                              } catch {
                                showToast("Falha ao buscar localização");
                              }
                            }}
                            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                          >
                            Sugerir país/cidade
                          </button>
                        </div>
                      </div>


                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div>
                          <label className="text-xs text-zinc-400">Imagem (thumbnailUrl)</label>
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
                        </div>

                        <button
                          onClick={() => openThumbPicker(i.id, i.url)}
                          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                        >
                          Escolher thumbnail
                        </button>
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
      </div>

      <datalist id="area-options">
        {areaOptions.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}
