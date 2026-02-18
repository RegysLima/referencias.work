"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProspectsDB, ProspectStatus } from "@/lib/types";

const EMPTY: ProspectsDB = {
  count: 0,
  items: [],
  updatedAt: null,
  lastRun: null,
};

const PAGE_SIZE = 20;

function labelStatus(value: ProspectStatus) {
  if (value === "new") return "Novo";
  if (value === "waiting") return "Espera";
  if (value === "approved") return "Aprovado";
  return "Novo";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export default function AdminProspectsPage() {
  const [data, setData] = useState<ProspectsDB>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectProgress, setCollectProgress] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"new" | "waiting" | "approved">("new");
  const [sortBy, setSortBy] = useState<"recent" | "alpha">("alpha");
  const [page, setPage] = useState(1);
  const [exitingIds, setExitingIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string>("");
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevTopsRef = useRef<Record<string, number>>({});

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/prospects", { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar prospects");
      const json = (await res.json()) as ProspectsDB;
      setData({ ...EMPTY, ...json });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function runCollect() {
    setCollecting(true);
    setError("");
    try {
      const start = await fetch("/api/admin/prospects/collect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (!start.ok) {
        const text = await start.text();
        throw new Error(text || "Falha ao iniciar coleta");
      }

      let done = false;
      let safety = 0;
      while (!done && safety < 250) {
        safety += 1;
        const step = await fetch("/api/admin/prospects/collect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "step" }),
        });
        if (!step.ok) {
          const text = await step.text();
          throw new Error(text || "Falha na coleta");
        }
        const result = (await step.json()) as {
          done?: boolean;
          progressPct?: number;
        };
        setCollectProgress(Math.max(0, Math.min(100, Number(result.progressPct || 0))));
        done = Boolean(result.done);
      }

      setCollectProgress(100);
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setError(msg);
    } finally {
      setCollecting(false);
      setTimeout(() => setCollectProgress(0), 1200);
    }
  }

  async function patchItemServer(id: string, payload: { status?: ProspectStatus; notes?: string | null }) {
    try {
      setError("");
      const res = await fetch("/api/admin/prospects", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Falha ao atualizar prospect");
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setError(msg);
      return false;
    }
  }

  function applyLocalPatch(id: string, payload: { status?: ProspectStatus; notes?: string | null }) {
    setData((prev) => {
      const nextItems =
        payload.status === "rejected"
          ? prev.items.filter((item) => item.id !== id)
          : prev.items.map((item) => {
              if (item.id !== id) return item;
              return {
                ...item,
                status: payload.status ?? item.status,
                notes:
                  payload.notes !== undefined
                    ? payload.notes || null
                    : item.notes,
              };
            });

      return {
        ...prev,
        items: nextItems,
        count: nextItems.length,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async function transitionAndPatch(
    id: string,
    payload: { status?: ProspectStatus; notes?: string | null },
    after?: () => void
  ) {
    setExitingIds((prev) => ({ ...prev, [id]: true }));
    await new Promise((resolve) => setTimeout(resolve, 140));
    applyLocalPatch(id, payload);
    setExitingIds((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    after?.();
    const ok = await patchItemServer(id, payload);
    if (!ok) {
      await loadData();
      return;
    }
    // reconcilia dados do backend sem bloquear a micro-interação local
    void loadData();
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function approveAndOpen(item: ProspectsDB["items"][number]) {
    try {
      setError("");
      await transitionAndPatch(item.id, { status: "approved" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setError(msg);
    }
  }

  const filteredItems = useMemo(() => {
    const base =
      statusFilter === "approved"
        ? data.items.filter((item) => item.status === "approved")
        : statusFilter === "waiting"
        ? data.items.filter((item) => item.status === "waiting")
        : data.items.filter((item) => item.status === "new");

    const sorted = [...base];
    if (sortBy === "alpha") {
      sorted.sort((a, b) =>
        (a.displayName || a.domain || "").localeCompare((b.displayName || b.domain || ""), "pt-BR")
      );
      return sorted;
    }

    sorted.sort(
      (a, b) =>
        new Date(b.firstSeenAt || b.lastSeenAt || 0).getTime() -
        new Date(a.firstSeenAt || a.lastSeenAt || 0).getTime()
    );
    return sorted;
  }, [data.items, statusFilter, sortBy]);

  const pendingCount = useMemo(
    () => data.items.filter((item) => item.status === "new").length,
    [data.items]
  );
  const approvedCount = useMemo(
    () => data.items.filter((item) => item.status === "approved").length,
    [data.items]
  );
  const waitingCount = useMemo(
    () => data.items.filter((item) => item.status === "waiting").length,
    [data.items]
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedItems = filteredItems.slice(pageStart, pageStart + PAGE_SIZE);

  useLayoutEffect(() => {
    const nextTops: Record<string, number> = {};

    for (const item of pagedItems) {
      const node = rowRefs.current[item.id];
      if (!node) continue;
      const nextTop = node.getBoundingClientRect().top;
      nextTops[item.id] = nextTop;
      const prevTop = prevTopsRef.current[item.id];
      if (prevTop === undefined) continue;

      const deltaY = prevTop - nextTop;
      if (!deltaY) continue;

      node.style.transition = "none";
      node.style.transform = `translateY(${deltaY}px)`;
      node.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: "translateY(0px)" },
        ],
        {
          duration: 260,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        }
      );
      node.style.transform = "";
    }

    prevTopsRef.current = nextTops;
  }, [pagedItems]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, filteredItems.length]);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 pb-12 pt-8 sm:px-10 lg:px-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Prospects de Referências</h1>
          <p className="text-sm text-zinc-400">
            Última coleta: {formatDate(data.lastRun?.ranAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="h-10 rounded-none border border-zinc-800 px-4 text-sm text-zinc-200 hover:border-zinc-600 disabled:opacity-50"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <button
            onClick={runCollect}
            disabled={collecting}
            className="h-10 rounded-none border border-zinc-200 bg-zinc-100 px-4 text-sm text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
          >
            {collecting ? `Coletando ${collectProgress}%` : "Executar coleta"}
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-none border border-zinc-900 bg-zinc-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Total na lista</div>
          <div className="mt-1 text-2xl text-zinc-100">{data.count}</div>
          <div className="mt-1 text-xs text-zinc-500">pendentes + espera + aprovados</div>
        </div>
        <div className="rounded-none border border-zinc-900 bg-zinc-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Adicionados na última coleta</div>
          <div className="mt-1 text-2xl text-zinc-100">{data.lastRun?.newCandidates || 0}</div>
          <div className="mt-1 text-xs text-zinc-500">entraram na lista para curadoria</div>
        </div>
        <div className="rounded-none border border-zinc-900 bg-zinc-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Já estavam nas referências</div>
          <div className="mt-1 text-2xl text-zinc-100">{data.lastRun?.skippedAlreadyKnownDomains || 0}</div>
          <div className="mt-1 text-xs text-zinc-500">não entraram na lista</div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex border border-zinc-800">
          <button
            onClick={() => setStatusFilter("new")}
            className={`h-10 px-4 text-sm transition ${
              statusFilter === "new"
                ? "bg-zinc-100 text-zinc-950"
                : "bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            Pendentes ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter("waiting")}
            className={`h-10 border-l border-zinc-800 px-4 text-sm transition ${
              statusFilter === "waiting"
                ? "bg-zinc-100 text-zinc-950"
                : "bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            Espera ({waitingCount})
          </button>
          <button
            onClick={() => setStatusFilter("approved")}
            className={`h-10 border-l border-zinc-800 px-4 text-sm transition ${
              statusFilter === "approved"
                ? "bg-zinc-100 text-zinc-950"
                : "bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            Aprovados ({approvedCount})
          </button>
        </div>
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "recent" | "alpha")}
            className="h-10 appearance-none rounded-none border border-zinc-800 bg-zinc-950 pl-3 pr-10 text-sm text-zinc-100"
          >
            <option value="alpha">Ordem alfabética</option>
            <option value="recent">Data de adição</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-400">
            ▾
          </span>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-none border border-red-900/70 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="rounded-none border border-zinc-900">
        <div className="grid grid-cols-12 border-b border-zinc-900 bg-zinc-950/80 px-3 py-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <div className="col-span-3">Domínio</div>
          <div className="col-span-2">Origens</div>
          <div className="col-span-2">Data de adição</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Ações</div>
        </div>

        {pagedItems.length === 0 ? (
          <div className="p-4 text-sm text-zinc-400">Nenhum prospect para o filtro atual.</div>
        ) : (
          pagedItems.map((item) => (
            <div
              key={item.id}
              ref={(node) => {
                rowRefs.current[item.id] = node;
              }}
              className={[
                "grid grid-cols-12 items-center gap-2 border-b border-zinc-900 px-3 py-3 text-sm text-zinc-200",
                "transition-all duration-200 ease-out",
                exitingIds[item.id] ? "translate-x-2 scale-[0.99] opacity-0" : "translate-x-0 opacity-100",
              ].join(" ")}
            >
              <div className="col-span-3">
                <div className="font-medium text-zinc-100">{item.displayName || item.domain}</div>
                <div className="text-xs text-zinc-500">{item.domain}</div>
              </div>

              <div className="col-span-2 text-xs text-zinc-400">
                {item.sources.length} links<br />
                {Math.max(item.occurrences || 0, item.sources.length || 0)} ocorrências únicas
              </div>

              <div className="col-span-2 text-xs text-zinc-400">{formatDate(item.firstSeenAt || item.lastSeenAt)}</div>

              <div className="col-span-2 text-xs text-zinc-300">{labelStatus(item.status)}</div>

              <div className="col-span-3 flex flex-wrap gap-2">
                {item.homepageUrl ? (
                  <a
                    href={item.homepageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center rounded-none border border-zinc-500 px-3 text-xs font-medium text-zinc-100 hover:border-zinc-300"
                  >
                    Abrir
                  </a>
                ) : (
                  <span className="inline-flex h-8 items-center rounded-none border border-zinc-800 px-3 text-xs text-zinc-500">
                    Sem URL
                  </span>
                )}
                {item.status !== "approved" ? (
                  <button
                    onClick={() => approveAndOpen(item)}
                    className="h-8 rounded-none border border-zinc-700 px-3 text-xs text-zinc-200 hover:border-zinc-500"
                  >
                    Aprovar
                  </button>
                ) : null}
                {item.status !== "waiting" ? (
                  <button
                    onClick={() => transitionAndPatch(item.id, { status: "waiting" })}
                    className="h-8 rounded-none border border-zinc-700 px-3 text-xs text-zinc-200 hover:border-zinc-500"
                  >
                    Espera
                  </button>
                ) : (
                  <button
                    onClick={() => transitionAndPatch(item.id, { status: "new" })}
                    className="h-8 rounded-none border border-zinc-700 px-3 text-xs text-zinc-200 hover:border-zinc-500"
                  >
                    Pendente
                  </button>
                )}
                <button
                  onClick={() => transitionAndPatch(item.id, { status: "rejected" })}
                  className="h-8 rounded-none border border-zinc-700 px-3 text-xs text-zinc-200 hover:border-zinc-500"
                >
                  Descartar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-zinc-500">
          Página {currentPage} de {totalPages} • {filteredItems.length} itens
        </div>
        <div className="inline-flex border border-zinc-800">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="h-9 px-3 text-xs text-zinc-300 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="h-9 border-l border-zinc-800 px-3 text-xs text-zinc-300 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </main>
  );
}
