"use client";

import { useEffect, useMemo, useState } from "react";

type Summary = {
  total: number;
  refTotal?: number;
  searchTotal?: number;
  byPath: Record<string, number>;
  byDay: Record<string, number>;
  byLang: Record<string, number>;
  byType?: Record<string, number>;
  byDayPath?: Record<string, Record<string, number>>;
  byDayLang?: Record<string, Record<string, number>>;
  byDayType?: Record<string, Record<string, number>>;
  byDayPathLang?: Record<string, Record<string, Record<string, number>>>;
  byRef?: Record<string, number>;
  byDayRef?: Record<string, Record<string, number>>;
  bySearchQuery?: Record<string, number>;
  byDaySearchQuery?: Record<string, Record<string, number>>;
  donation?: {
    cardView: number;
    pixClick: number;
    paypalClick: number;
    dismiss: number;
  };
  lastUpdated?: string | null;
};

const EMPTY: Summary = {
  total: 0,
  refTotal: 0,
  byPath: {},
  byDay: {},
  byLang: {},
  byType: {},
  byDayPath: {},
  byDayLang: {},
  byDayType: {},
  byDayPathLang: {},
  byRef: {},
  byDayRef: {},
  bySearchQuery: {},
  byDaySearchQuery: {},
  donation: {
    cardView: 0,
    pixClick: 0,
    paypalClick: 0,
    dismiss: 0,
  },
  lastUpdated: null,
};

function toRows(obj: Record<string, number>) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getLastDays(count: number) {
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toDayKey(d));
  }
  return days;
}

function getRangeDays(range: string, keys: string[]) {
  if (range === "all") {
    return [...keys].sort();
  }
  const n = Number(range);
  if (!Number.isFinite(n) || n <= 0) return [];
  return getLastDays(n);
}

function pickPathLabel(path: string) {
  if (path === "/") return "Home";
  if (path === "/sobre") return "Sobre";
  return path;
}

function formatDateBR(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return withTime ? date.toLocaleString("pt-BR") : date.toLocaleDateString("pt-BR");
}

function formatMonthLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function parsePathFilter(value: string) {
  const parts = value.split("||");
  if (parts.length === 2) {
    return { path: parts[0], lang: parts[1] };
  }
  return { path: value, lang: "" };
}

function getDayCount(
  summary: Summary,
  day: string,
  pathFilter: string,
  langFilter: string
) {
  const parsed = parsePathFilter(pathFilter);
  const path = pathFilter === "all" ? "" : parsed.path;
  const langOverride = parsed.lang;
  const lang = langOverride || (langFilter === "all" ? "" : langFilter);

  if (path && lang) {
    return summary.byDayPathLang?.[day]?.[path]?.[lang] || 0;
  }
  if (path) {
    return summary.byDayPath?.[day]?.[path] || 0;
  }
  if (lang) {
    return summary.byDayLang?.[day]?.[lang] || 0;
  }
  return summary.byDay?.[day] || 0;
}

function sumByDayRef(summary: Summary, days: string[]) {
  const result: Record<string, number> = {};
  for (const day of days) {
    const row = summary.byDayRef?.[day];
    if (!row) continue;
    for (const [key, count] of Object.entries(row)) {
      result[key] = (result[key] || 0) + count;
    }
  }
  return result;
}

function sumByDayType(summary: Summary, days: string[]) {
  const result: Record<string, number> = {};
  for (const day of days) {
    const row = summary.byDayType?.[day];
    if (!row) continue;
    for (const [key, count] of Object.entries(row)) {
      result[key] = (result[key] || 0) + count;
    }
  }
  return result;
}

function sumByDaySearchQuery(summary: Summary, days: string[]) {
  const result: Record<string, number> = {};
  for (const day of days) {
    const row = summary.byDaySearchQuery?.[day];
    if (!row) continue;
    for (const [key, count] of Object.entries(row)) {
      result[key] = (result[key] || 0) + count;
    }
  }
  return result;
}

function LineChart({
  data,
  height = 120,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = data.length > 1 ? 100 / (data.length - 1) : 100;
  const padding = 2;
  const innerHeight = height - padding * 2;
  const baseY = height - padding;
  const points = data.map((d, idx) => {
    const x = idx * step;
    const y = baseY - (d.value / max) * innerHeight;
    return `${x},${y}`;
  });
  const path = points.length ? `M ${points.join(" L ")}` : "";
  const areaPath = points.length
    ? `M 0,${height} L ${points.join(" L ")} L 100,${height} Z`
    : "";

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="h-28 w-full"
    >
      <defs>
        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0000CD" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0000CD" stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath ? <path d={areaPath} fill="url(#lineFill)" /> : null}
      {path ? (
        <path
          d={path}
          fill="none"
          stroke="#0000CD"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30");
  const [pathFilter, setPathFilter] = useState("all");
  const [langFilter, setLangFilter] = useState("all");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/analytics")
      .then((res) => (res.ok ? res.json() : EMPTY))
      .then((data) => {
        if (!active) return;
        setSummary({ ...EMPTY, ...data });
      })
      .catch(() => {
        if (!active) return;
        setSummary(EMPTY);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const pathOptions = useMemo(() => {
    const base = toRows(summary.byPath).map(([path]) => ({
      value: path,
      label: pickPathLabel(path),
    }));
    return [{ value: "all", label: "Todas as páginas" }, ...base];
  }, [summary.byPath]);
  const langOptions = useMemo(() => {
    const base = toRows(summary.byLang).map(([lang]) => lang);
    const merged = new Set(["pt", "es", "en", ...base]);
    return ["all", ...Array.from(merged)];
  }, [summary.byLang]);

  const dayKeys = useMemo(() => Object.keys(summary.byDay || {}), [summary.byDay]);
  const rangeDays = useMemo(() => getRangeDays(range, dayKeys), [range, dayKeys]);

  const daySeries = useMemo(
    () =>
      rangeDays.map((day) => ({
        label: day,
        value: getDayCount(summary, day, pathFilter, langFilter),
      })),
    [rangeDays, summary, pathFilter, langFilter]
  );

  const totalInRange = useMemo(
    () => daySeries.reduce((acc, d) => acc + d.value, 0),
    [daySeries]
  );

  const last7Days = useMemo(() => getLastDays(7), []);
  const last30Days = useMemo(() => getLastDays(30), []);
  const last7Total = useMemo(
    () => last7Days.reduce((acc, day) => acc + (summary.byDay?.[day] || 0), 0),
    [last7Days, summary.byDay]
  );
  const last30Total = useMemo(
    () => last30Days.reduce((acc, day) => acc + (summary.byDay?.[day] || 0), 0),
    [last30Days, summary.byDay]
  );

  const topPath = useMemo(() => toRows(summary.byPath)[0], [summary.byPath]);
  const topRef = useMemo(() => toRows(summary.byRef || {})[0], [summary.byRef]);

  const filteredRefs = useMemo(() => {
    if (range === "all") return summary.byRef || {};
    return sumByDayRef(summary, rangeDays);
  }, [summary, range, rangeDays]);

  const filteredTypes = useMemo(() => {
    if (range === "all") return summary.byType || {};
    return sumByDayType(summary, rangeDays);
  }, [summary, range, rangeDays]);

  const filteredSearchQueries = useMemo(() => {
    if (range === "all") return summary.bySearchQuery || {};
    return sumByDaySearchQuery(summary, rangeDays);
  }, [summary, range, rangeDays]);

  const refRows = useMemo(() => toRows(filteredRefs).slice(0, 10), [filteredRefs]);
  const searchRows = useMemo(
    () => toRows(filteredSearchQueries).slice(0, 10),
    [filteredSearchQueries]
  );
  const interactionRows = useMemo(
    () =>
      toRows(filteredTypes)
        .filter(([type]) => type !== "page")
        .slice(0, 10),
    [filteredTypes]
  );
  const donationViews = filteredTypes["donation_card_view"] || 0;
  const pixClicks = filteredTypes["donation_pix_click"] || 0;
  const paypalClicks = filteredTypes["donation_paypal_click"] || 0;
  const donationClickRate = donationViews
    ? (((pixClicks + paypalClicks) / donationViews) * 100).toFixed(1)
    : "0.0";
  const searchTotalInRange = filteredTypes.search || summary.searchTotal || 0;
  const tickDays = useMemo(() => {
    const len = rangeDays.length;
    if (!len) return [];
    const maxTicks = 6;
    if (len <= maxTicks) return rangeDays;
    const step = Math.max(1, Math.floor((len - 1) / (maxTicks - 1)));
    const ticks: string[] = [];
    for (let i = 0; i < len; i += step) ticks.push(rangeDays[i]);
    if (ticks[ticks.length - 1] !== rangeDays[len - 1]) ticks.push(rangeDays[len - 1]);
    return ticks;
  }, [rangeDays]);
  const tickLabel = useMemo(() => {
    const longRange = range === "all" || rangeDays.length > 60;
    return (day: string) => (longRange ? formatMonthLabel(day) : formatDateBR(day));
  }, [range, rangeDays.length]);
  const rangeLabel = useMemo(() => {
    const label =
      range === "7"
        ? "Últimos 7 dias"
        : range === "30"
        ? "Últimos 30 dias"
        : range === "90"
        ? "Últimos 90 dias"
        : "Todo o período";
    if (!rangeDays.length) return label;
    return `${label} · ${formatDateBR(rangeDays[0])} – ${formatDateBR(
      rangeDays[rangeDays.length - 1]
    )}`;
  }, [range, rangeDays]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pb-16 pt-10 sm:px-10 lg:px-12">
      <div className="mb-6 text-sm uppercase tracking-[0.18em] text-zinc-400">Analytics</div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Filtros</div>

          <div className="relative">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="appearance-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 pr-10 text-sm"
            >
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="all">Todo o período</option>
            </select>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500"
              viewBox="0 0 12 12"
              fill="none"
            >
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="relative">
            <select
              value={pathFilter}
              onChange={(e) => setPathFilter(e.target.value)}
              className="appearance-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 pr-10 text-sm"
            >
              {pathOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500"
              viewBox="0 0 12 12"
              fill="none"
            >
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="relative">
            <select
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              className="appearance-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 pr-10 text-sm"
            >
              {langOptions.map((lang) => (
                <option key={lang} value={lang}>
                  {lang === "all" ? "Todos os idiomas" : lang.toUpperCase()}
                </option>
              ))}
            </select>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500"
              viewBox="0 0 12 12"
              fill="none"
            >
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Total visitas</div>
          <div className="mt-2 text-2xl text-zinc-100">{summary.total}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Últimos 7 dias</div>
          <div className="mt-2 text-2xl text-zinc-100">{last7Total}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Últimos 30 dias</div>
          <div className="mt-2 text-2xl text-zinc-100">{last30Total}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Visitas no filtro</div>
          <div className="mt-2 text-2xl text-zinc-100">{totalInRange}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Top página</div>
          <div className="mt-2 text-sm text-zinc-300">
            {topPath ? pickPathLabel(topPath[0]) : "—"}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{topPath ? topPath[1] : "—"}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Cliques em referências</div>
          <div className="mt-2 text-2xl text-zinc-100">{summary.refTotal || 0}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Top referência</div>
          <div className="mt-2 text-sm text-zinc-300">
            {topRef ? topRef[0] : "—"}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{topRef ? topRef[1] : "—"}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Última atualização</div>
          <div className="mt-2 text-sm text-zinc-300">
            {formatDateBR(summary.lastUpdated, true)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Buscas no período</div>
          <div className="mt-2 text-2xl text-zinc-100">{searchTotalInRange}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Views do card de apoio</div>
          <div className="mt-2 text-2xl text-zinc-100">{donationViews}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Cliques Pix + PayPal</div>
          <div className="mt-2 text-2xl text-zinc-100">{pixClicks + paypalClicks}</div>
          <div className="mt-1 text-xs text-zinc-500">
            Pix: {pixClicks} · PayPal: {paypalClicks}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs text-zinc-500">Taxa clique no apoio</div>
          <div className="mt-2 text-2xl text-zinc-100">{donationClickRate}%</div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Visitas por dia</div>
            <div className="text-[11px] text-zinc-500">
              {loading ? "Carregando…" : rangeLabel}
            </div>
          </div>
          {daySeries.length ? (
            <div className="mt-4">
              <LineChart data={daySeries} />
              <div className="mt-2 flex justify-between text-[11px] text-zinc-500">
                {tickDays.map((day) => (
                  <span key={day}>{tickLabel(day)}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 text-sm text-zinc-500">Sem dados para o período.</div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Idiomas</div>
          <div className="mt-4 space-y-2 text-sm text-zinc-300">
            {toRows(summary.byLang).length ? (
              toRows(summary.byLang).map(([lang, count]) => (
                <div key={lang} className="flex items-center justify-between">
                  <span>{lang.toUpperCase()}</span>
                  <span className="text-zinc-500">{count}</span>
                </div>
              ))
            ) : (
              <div className="text-zinc-500">—</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Páginas</div>
          <div className="mt-4 space-y-2 text-sm text-zinc-300">
            {toRows(summary.byPath).length ? (
              toRows(summary.byPath).map(([path, count]) => (
                <div key={path} className="flex items-center justify-between">
                  <span className="truncate">{pickPathLabel(path)}</span>
                  <span className="text-zinc-500">{count}</span>
                </div>
              ))
            ) : (
              <div className="text-zinc-500">—</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5 lg:col-span-2">
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Ranking de referências</div>
          <div className="mt-4 space-y-2 text-sm text-zinc-300">
            {refRows.length ? (
              refRows.map(([ref, count], idx) => (
                <div key={`${ref}-${idx}`} className="flex items-center justify-between">
                  <span className="truncate">{ref}</span>
                  <span className="text-zinc-500">{count}</span>
                </div>
              ))
            ) : (
              <div className="text-zinc-500">—</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5 lg:col-span-2">
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
            Top buscas
          </div>
          <div className="mt-4 space-y-2 text-sm text-zinc-300">
            {searchRows.length ? (
              searchRows.map(([query, count], idx) => (
                <div key={`${query}-${idx}`} className="flex items-center justify-between">
                  <span className="truncate">{query}</span>
                  <span className="text-zinc-500">{count}</span>
                </div>
              ))
            ) : (
              <div className="text-zinc-500">—</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
            Eventos de interação
          </div>
          <div className="mt-4 space-y-2 text-sm text-zinc-300">
            {interactionRows.length ? (
              interactionRows.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="truncate">{type}</span>
                  <span className="text-zinc-500">{count}</span>
                </div>
              ))
            ) : (
              <div className="text-zinc-500">—</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
