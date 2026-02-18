"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProspectsDB, ProspectStatus } from "@/lib/types";

const EMPTY: ProspectsDB = {
  count: 0,
  items: [],
  updatedAt: null,
  lastRun: null,
};

function labelStatus(value: ProspectStatus) {
  if (value === "new") return "Novo";
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
  const [statusFilter, setStatusFilter] = useState<"all" | "new">("new");
  const [error, setError] = useState<string>("");

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

  async function patchItem(id: string, payload: { status?: ProspectStatus; notes?: string | null }) {
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
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setError(msg);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function approveAndOpen(item: ProspectsDB["items"][number]) {
    try {
      setError("");
      const res = await fetch("/api/admin/prospects", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, status: "approved" }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Falha ao aprovar prospect");
      }

      const params = new URLSearchParams();
      params.set("prefillName", item.displayName || item.domain);
      params.set("prefillUrl", item.homepageUrl || `https://${item.domain}`);
      params.set("prefillMacroType", "Studios");
      params.set("prospectId", item.id);
      window.location.href = `/admin?${params.toString()}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setError(msg);
    }
  }

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return data.items;
    return data.items.filter((item) => item.status === "new");
  }, [data.items, statusFilter]);

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
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Total na base</div>
          <div className="mt-1 text-2xl text-zinc-100">{data.count}</div>
          <div className="mt-1 text-xs text-zinc-500">candidatos após limpeza</div>
        </div>
        <div className="rounded-none border border-zinc-900 bg-zinc-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Novos pendentes</div>
          <div className="mt-1 text-2xl text-zinc-100">
            {data.items.filter((item) => item.status === "new").length}
          </div>
          <div className="mt-1 text-xs text-zinc-500">status Novo</div>
        </div>
        <div className="rounded-none border border-zinc-900 bg-zinc-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Páginas rastreadas</div>
          <div className="mt-1 text-2xl text-zinc-100">{data.lastRun?.crawledPages || 0}</div>
          <div className="mt-1 text-xs text-zinc-500">na última coleta</div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-none border border-zinc-900 bg-zinc-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Descobertos</div>
          <div className="mt-1 text-2xl text-zinc-100">{data.lastRun?.discoveredCandidates || 0}</div>
          <div className="mt-1 text-xs text-zinc-500">domínios únicos vistos no crawl</div>
        </div>
        <div className="rounded-none border border-zinc-900 bg-zinc-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Novos adicionados</div>
          <div className="mt-1 text-2xl text-zinc-100">{data.lastRun?.newCandidates || 0}</div>
          <div className="mt-1 text-xs text-zinc-500">entraram na sua base</div>
        </div>
        <div className="rounded-none border border-zinc-900 bg-zinc-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Já existentes</div>
          <div className="mt-1 text-2xl text-zinc-100">{data.lastRun?.skippedAlreadyKnownDomains || 0}</div>
          <div className="mt-1 text-xs text-zinc-500">já estavam nas referências</div>
        </div>
      </div>

      <div className="mb-4 inline-flex border border-zinc-800">
        <button
          onClick={() => setStatusFilter("all")}
          className={`h-10 px-4 text-sm transition ${
            statusFilter === "all"
              ? "bg-zinc-100 text-zinc-950"
              : "bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => setStatusFilter("new")}
          className={`h-10 border-l border-zinc-800 px-4 text-sm transition ${
            statusFilter === "new"
              ? "bg-zinc-100 text-zinc-950"
              : "bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
          }`}
        >
          Novos
        </button>
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
          <div className="col-span-2">Última coleta</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Ações</div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-4 text-sm text-zinc-400">Nenhum prospect para o filtro atual.</div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-12 items-center gap-2 border-b border-zinc-900 px-3 py-3 text-sm text-zinc-200"
            >
              <div className="col-span-3">
                <div className="font-medium text-zinc-100">{item.displayName || item.domain}</div>
                <div className="text-xs text-zinc-500">{item.domain}</div>
              </div>

              <div className="col-span-2 text-xs text-zinc-400">
                {item.sources.length} links<br />
                {Math.max(item.occurrences || 0, item.sources.length || 0)} ocorrências únicas
              </div>

              <div className="col-span-2 text-xs text-zinc-400">{formatDate(item.lastSeenAt)}</div>

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
                <button
                  onClick={() => approveAndOpen(item)}
                  className="h-8 rounded-none border border-zinc-700 px-3 text-xs text-zinc-200 hover:border-zinc-500"
                >
                  Aprovar
                </button>
                <button
                  onClick={() => patchItem(item.id, { status: "rejected" })}
                  className="h-8 rounded-none border border-zinc-700 px-3 text-xs text-zinc-200 hover:border-zinc-500"
                >
                  Descartar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
