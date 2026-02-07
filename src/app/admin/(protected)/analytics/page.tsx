import { kv } from "@vercel/kv";

const KV_KEY = "analytics:summary";
const KV_ENABLED = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);

type Summary = {
  total: number;
  byPath: Record<string, number>;
  byDay: Record<string, number>;
  byLang: Record<string, number>;
  lastUpdated?: string | null;
};

function toRows(obj: Record<string, number>) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

export default async function AdminAnalyticsPage() {
  const summary: Summary = KV_ENABLED
    ? ((await kv.get<Summary>(KV_KEY)) || {
        total: 0,
        byPath: {},
        byDay: {},
        byLang: {},
        lastUpdated: null,
      })
    : {
        total: 0,
        byPath: {},
        byDay: {},
        byLang: {},
        lastUpdated: null,
      };

  const pathRows = toRows(summary.byPath).slice(0, 10);
  const dayRows = toRows(summary.byDay).slice(0, 10);
  const langRows = toRows(summary.byLang);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 sm:px-10 lg:px-12">
      <div className="mb-6 text-sm uppercase tracking-[0.18em] text-zinc-400">Analytics</div>

      {!KV_ENABLED ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5 text-sm text-zinc-400">
          KV não configurado.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
              <div className="text-xs text-zinc-500">Total</div>
              <div className="mt-2 text-2xl text-zinc-100">{summary.total}</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
              <div className="text-xs text-zinc-500">Ultima atualizacao</div>
              <div className="mt-2 text-sm text-zinc-300">
                {summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleString() : "—"}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Por pagina</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-300">
                {pathRows.length ? (
                  pathRows.map(([path, count]) => (
                    <div key={path} className="flex items-center justify-between">
                      <span className="truncate">{path}</span>
                      <span className="text-zinc-500">{count}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-zinc-500">—</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Por dia</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-300">
                {dayRows.length ? (
                  dayRows.map(([day, count]) => (
                    <div key={day} className="flex items-center justify-between">
                      <span>{day}</span>
                      <span className="text-zinc-500">{count}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-zinc-500">—</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Idiomas</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-300">
                {langRows.length ? (
                  langRows.map(([lang, count]) => (
                    <div key={lang} className="flex items-center justify-between">
                      <span>{lang}</span>
                      <span className="text-zinc-500">{count}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-zinc-500">—</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
