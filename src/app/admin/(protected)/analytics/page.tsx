"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
const HEATMAP_COLS = 24;
const HEATMAP_ROWS = 120;

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
  byNoResultQuery?: Record<string, number>;
  byDayNoResultQuery?: Record<string, Record<string, number>>;
  donation?: {
    cardView: number;
    pixClick: number;
    paypalClick: number;
    dismiss: number;
  };
  heatmapHome?: Record<string, number>;
  heatmapHomeByDevice?: {
    desktop: Record<string, number>;
    mobile: Record<string, number>;
  };
  normalizeFilters?: {
    ranAt: string;
    total: number;
    changedItems: number;
    normalized: boolean;
    updatedAt: string | null;
    source: "cron" | "manual";
  } | null;
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
  byNoResultQuery: {},
  byDayNoResultQuery: {},
  donation: {
    cardView: 0,
    pixClick: 0,
    paypalClick: 0,
    dismiss: 0,
  },
  heatmapHome: {},
  heatmapHomeByDevice: {
    desktop: {},
    mobile: {},
  },
  normalizeFilters: null,
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

function sumByDayNoResultQuery(summary: Summary, days: string[]) {
  const result: Record<string, number> = {};
  for (const day of days) {
    const row = summary.byDayNoResultQuery?.[day];
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

function getInteractionLabel(type: string) {
  const map: Record<string, string> = {
    load_more_click: "Carregar mais",
    filter_apply: "Aplicar filtro",
    donation_card_view: "Card de apoio (view)",
    donation_card_dismiss: "Card de apoio (fechar)",
    donation_pix_click: "Apoio via Pix",
    donation_paypal_click: "Apoio via PayPal",
    search: "Busca",
    search_no_results: "Busca sem resultado",
    ref: "Clique em referência",
  };
  if (map[type]) return map[type];
  return type.replace(/_/g, " ");
}

function parseHeatmapCells(source: Record<string, number>) {
  const cells = Object.entries(source)
    .map(([key, value]) => {
      const [xRaw, yRaw] = key.split(":");
      const x = Number(xRaw);
      const y = Number(yRaw);
      if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
      return { key, x, y, value: Number(value) || 0 };
    })
    .filter((item): item is { key: string; x: number; y: number; value: number } => Boolean(item));
  const max = Math.max(0, ...cells.map((c) => c.value));
  return { cells, max };
}

function getHeatColor(ratio: number) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const hue = Math.round(220 - clamped * 220);
  const alpha = 0.16 + clamped * 0.84;
  return `hsla(${hue}, 92%, 54%, ${alpha})`;
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30");
  const [pathFilter, setPathFilter] = useState("all");
  const [langFilter, setLangFilter] = useState("all");
  const [heatmapDeviceTab, setHeatmapDeviceTab] = useState<"desktop" | "mobile">("desktop");
  const [desktopPreviewHeight, setDesktopPreviewHeight] = useState(3600);
  const [mobilePreviewHeight, setMobilePreviewHeight] = useState(5200);
  const desktopFrameRef = useRef<HTMLIFrameElement | null>(null);
  const mobileFrameRef = useRef<HTMLIFrameElement | null>(null);
  const view = searchParams.get("view") === "heatmap" ? "heatmap" : "dashboard";

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
  const filteredNoResultSearchQueries = useMemo(() => {
    if (range === "all") return summary.byNoResultQuery || {};
    return sumByDayNoResultQuery(summary, rangeDays);
  }, [summary, range, rangeDays]);
  const noResultSearchRows = useMemo(
    () => toRows(filteredNoResultSearchQueries).slice(0, 10),
    [filteredNoResultSearchQueries]
  );
  const interactionRows = useMemo(
    () => {
      const base = Object.entries(filteredTypes).filter(([type]) => type !== "page" && type !== "ref");

      const refCountFromRanking = Object.values(filteredRefs).reduce((acc, count) => acc + count, 0);
      const refCount = range === "all" ? Math.max(summary.refTotal || 0, refCountFromRanking) : refCountFromRanking;

      if (refCount > 0) {
        base.push(["ref", refCount]);
      }

      return base.sort((a, b) => b[1] - a[1]).slice(0, 10);
    },
    [filteredTypes, filteredRefs, range, summary.refTotal]
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
  const heatmapDesktop = useMemo(
    () => parseHeatmapCells(summary.heatmapHomeByDevice?.desktop || {}),
    [summary.heatmapHomeByDevice]
  );
  const heatmapMobile = useMemo(
    () => parseHeatmapCells(summary.heatmapHomeByDevice?.mobile || {}),
    [summary.heatmapHomeByDevice]
  );
  const heatmapCombined = useMemo(
    () => parseHeatmapCells(summary.heatmapHome || {}),
    [summary.heatmapHome]
  );
  const heatmap = heatmapDeviceTab === "desktop" ? heatmapDesktop : heatmapMobile;
  const heatmapFallback =
    !heatmap.cells.length && heatmapCombined.cells.length ? heatmapCombined : heatmap;
  const heatmapTotal = useMemo(
    () => heatmapFallback.cells.reduce((acc, cell) => acc + cell.value, 0),
    [heatmapFallback.cells]
  );

  function setView(next: "dashboard" | "heatmap") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "heatmap") params.set("view", "heatmap");
    else params.delete("view");
    const query = params.toString();
    router.replace(query ? `/admin/analytics?${query}` : "/admin/analytics");
  }

  function measurePreviewHeight(device: "desktop" | "mobile") {
    const frame = device === "desktop" ? desktopFrameRef.current : mobileFrameRef.current;
    if (!frame) return;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const root = doc.documentElement;
      const body = doc.body;
      const footer = doc.querySelector("footer");
      const footerBottom = footer
        ? footer.getBoundingClientRect().bottom + (doc.defaultView?.scrollY || 0)
        : 0;
      const measuredByScroll = Math.max(
        root?.scrollHeight || 0,
        body?.scrollHeight || 0,
        root?.offsetHeight || 0,
        body?.offsetHeight || 0
      );
      const measured = footerBottom > 0 ? footerBottom : measuredByScroll;
      if (!Number.isFinite(measured) || measured <= 0) return;
      if (device === "desktop") {
        const next = Math.max(1600, Math.min(5600, Math.round(measured + 8)));
        setDesktopPreviewHeight(next);
      } else {
        const next = Math.max(2000, Math.min(7600, Math.round(measured + 8)));
        setMobilePreviewHeight(next);
      }
    } catch {
      // ignore cross-origin or transient load cases
    }
  }

  const metricCardClass = "rounded-xl border border-zinc-800 bg-zinc-950/30 p-5 min-h-[112px]";
  const panelCardClass = "rounded-xl border border-zinc-800 bg-zinc-950/30 p-5";
  const panelTitleClass = "text-xs uppercase tracking-[0.16em] text-zinc-500";

  useEffect(() => {
    if (view !== "heatmap") return;
    const timer = window.setTimeout(() => {
      measurePreviewHeight(heatmapDeviceTab);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [view, heatmapDeviceTab]);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-6 pb-16 pt-10 sm:px-10 lg:px-12">
      <div className="mb-6 text-sm uppercase tracking-[0.18em] text-zinc-400">Analytics</div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-zinc-800 bg-zinc-950/30 p-3 lg:sticky lg:top-24">
          <div className={panelTitleClass}>Visões</div>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => setView("dashboard")}
              className={`cursor-pointer rounded-md border px-3 py-2 text-left text-sm transition ${
                view === "dashboard"
                  ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                  : "border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-zinc-700"
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setView("heatmap")}
              className={`cursor-pointer rounded-md border px-3 py-2 text-left text-sm transition ${
                view === "heatmap"
                  ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                  : "border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-zinc-700"
              }`}
            >
              Heatmap
            </button>
          </div>
        </aside>

        {view === "dashboard" ? (
          <section>
            <div className={panelCardClass}>
              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                <div className={panelTitleClass}>Filtros</div>

                <div className="relative">
                  <select
                    value={range}
                    onChange={(e) => setRange(e.target.value)}
                    className="cursor-pointer appearance-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 pr-10 text-sm"
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
                    className="cursor-pointer appearance-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 pr-10 text-sm"
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
                    className="cursor-pointer appearance-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 pr-10 text-sm"
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

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Total visitas</div>
          <div className="mt-2 text-2xl text-zinc-100">{summary.total}</div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Últimos 7 dias</div>
          <div className="mt-2 text-2xl text-zinc-100">{last7Total}</div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Últimos 30 dias</div>
          <div className="mt-2 text-2xl text-zinc-100">{last30Total}</div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Visitas no filtro</div>
          <div className="mt-2 text-2xl text-zinc-100">{totalInRange}</div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Cliques em referências</div>
          <div className="mt-2 text-2xl text-zinc-100">{summary.refTotal || 0}</div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Top referência</div>
          <div className="mt-2 text-sm text-zinc-300">
            {topRef ? topRef[0] : "—"}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{topRef ? topRef[1] : "—"}</div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Última atualização</div>
          <div className="mt-2 text-sm text-zinc-300">
            {formatDateBR(summary.lastUpdated, true)}
          </div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Normalização diária</div>
          <div className="mt-2 text-sm text-zinc-300">
            {formatDateBR(summary.normalizeFilters?.ranAt, true)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {summary.normalizeFilters
              ? `${summary.normalizeFilters.changedItems} ajustados de ${summary.normalizeFilters.total}`
              : "Sem execução registrada"}
          </div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Buscas no período</div>
          <div className="mt-2 text-2xl text-zinc-100">{searchTotalInRange}</div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Views do card de apoio</div>
          <div className="mt-2 text-2xl text-zinc-100">{donationViews}</div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Cliques Pix + PayPal</div>
          <div className="mt-2 text-2xl text-zinc-100">{pixClicks + paypalClicks}</div>
          <div className="mt-1 text-xs text-zinc-500">
            Pix: {pixClicks} · PayPal: {paypalClicks}
          </div>
        </div>
        <div className={`${metricCardClass} xl:col-span-3`}>
          <div className="text-xs text-zinc-500">Taxa clique no apoio</div>
          <div className="mt-2 text-2xl text-zinc-100">{donationClickRate}%</div>
        </div>
      </div>

            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className={`${panelCardClass} xl:col-span-8`}>
          <div className="flex items-center justify-between gap-3">
            <div className={panelTitleClass}>Visitas por dia</div>
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

        <div className={`${panelCardClass} xl:col-span-4`}>
          <div className={panelTitleClass}>Idiomas</div>
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
        <div className={`${panelCardClass} xl:col-span-4`}>
          <div className={panelTitleClass}>Páginas</div>
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

        <div className={`${panelCardClass} xl:col-span-8`}>
          <div className={panelTitleClass}>Ranking de referências</div>
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
        <div className={`${panelCardClass} xl:col-span-6`}>
          <div className={panelTitleClass}>Top buscas</div>
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

        <div className={`${panelCardClass} xl:col-span-3`}>
          <div className={panelTitleClass}>Buscas sem resultado</div>
          <div className="mt-4 space-y-2 text-sm text-zinc-300">
            {noResultSearchRows.length ? (
              noResultSearchRows.map(([query, count], idx) => (
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
        <div className={`${panelCardClass} xl:col-span-3`}>
          <div className={panelTitleClass}>Eventos de interação</div>
          <div className="mt-4 space-y-2 text-sm text-zinc-300">
            {interactionRows.length ? (
              interactionRows.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="truncate">{getInteractionLabel(type)}</span>
                  <span className="text-zinc-500">{count}</span>
                </div>
              ))
            ) : (
              <div className="text-zinc-500">—</div>
            )}
          </div>
        </div>
      </div>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className={`${metricCardClass} xl:col-span-4`}>
                <div className="text-xs text-zinc-500">Pontos capturados ({heatmapDeviceTab})</div>
                <div className="mt-2 text-2xl text-zinc-100">{heatmapTotal}</div>
              </div>
              <div className={`${metricCardClass} xl:col-span-4`}>
                <div className="text-xs text-zinc-500">Células com atividade</div>
                <div className="mt-2 text-2xl text-zinc-100">{heatmapFallback.cells.length}</div>
              </div>
              <div className={`${metricCardClass} xl:col-span-4`}>
                <div className="text-xs text-zinc-500">Última atualização</div>
                <div className="mt-2 text-sm text-zinc-300">{formatDateBR(summary.lastUpdated, true)}</div>
              </div>
            </div>

            <div className={`${panelCardClass} overflow-hidden`}>
              <div className={panelTitleClass}>Heatmap de mouse (home)</div>
              <div className="mt-1 text-xs text-zinc-500">
                Mapa vertical estilo sessão completa, com largura desktop estável.
              </div>
              <div className="mt-3 inline-flex rounded-md border border-zinc-800 bg-zinc-950/50 p-1">
                <button
                  type="button"
                  onClick={() => setHeatmapDeviceTab("desktop")}
                  className={`cursor-pointer rounded px-3 py-1.5 text-sm transition ${
                    heatmapDeviceTab === "desktop"
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setHeatmapDeviceTab("mobile")}
                  className={`cursor-pointer rounded px-3 py-1.5 text-sm transition ${
                    heatmapDeviceTab === "mobile"
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  Mobile
                </button>
              </div>
              <div className="mt-2 flex items-center justify-end text-[11px] text-zinc-500">
                Role verticalmente para explorar a página completa
              </div>
              <div className="mt-2 h-[70vh] overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-800 bg-zinc-950/90 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div
                  className={`relative mx-auto overflow-hidden ${
                    heatmapDeviceTab === "desktop"
                      ? "w-full max-w-[1320px]"
                      : "w-full max-w-[390px]"
                  }`}
                  style={{
                    height: `${
                      heatmapDeviceTab === "desktop"
                        ? desktopPreviewHeight
                        : mobilePreviewHeight
                    }px`,
                  }}
                >
                  <iframe
                    src="/"
                    title={`Prévia da home ${heatmapDeviceTab}`}
                    ref={heatmapDeviceTab === "desktop" ? desktopFrameRef : mobileFrameRef}
                    onLoad={() => measurePreviewHeight(heatmapDeviceTab)}
                    className="pointer-events-none absolute inset-0 h-full w-full opacity-60 saturate-0"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/20 via-zinc-950/10 to-zinc-950/60" />
                  {heatmapFallback.cells.map((cell) => {
                    const ratio = heatmapFallback.max ? cell.value / heatmapFallback.max : 0;
                    return (
                      <div
                        key={cell.key}
                        className="absolute"
                        style={{
                          left: `${(cell.x / HEATMAP_COLS) * 100}%`,
                          top: `${(cell.y / HEATMAP_ROWS) * 100}%`,
                          width: `${100 / HEATMAP_COLS}%`,
                          height: `${100 / HEATMAP_ROWS}%`,
                          background: getHeatColor(ratio),
                        }}
                        title={`${cell.value} movimentos`}
                      />
                    );
                  })}
                </div>
                <div className="pointer-events-none sticky bottom-4 ml-auto mr-4 mt-[-36px] w-fit rounded-md border border-zinc-700/80 bg-zinc-950/85 px-3 py-1.5 text-[11px] text-zinc-300">
                  Frio
                  <span className="mx-1 inline-block h-2 w-20 align-middle bg-gradient-to-r from-blue-500 via-cyan-400 via-yellow-400 to-red-500" />
                  Quente
                </div>
              </div>
              {!heatmap.cells.length && heatmapCombined.cells.length ? (
                <div className="mt-2 text-xs text-zinc-500">
                  Sem base separada por dispositivo ainda; exibindo dados gerais coletados anteriormente.
                </div>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
