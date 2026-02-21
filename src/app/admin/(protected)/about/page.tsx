"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";

type AboutSection = {
  id: string;
  title: Record<Lang, string>;
  body: Record<Lang, string>;
};

function normalizeText(value: unknown): Record<Lang, string> {
  if (typeof value === "string") return { pt: value, en: "", es: "" };
  if (value && typeof value === "object") {
    const v = value as Partial<Record<Lang, string>>;
    return { pt: v.pt || "", en: v.en || "", es: v.es || "" };
  }
  return { pt: "", en: "", es: "" };
}

export default function AdminAboutPage() {
  const [aboutTitle, setAboutTitle] = useState<Record<Lang, string>>({
    pt: "Sobre o projeto",
    en: "",
    es: "",
  });
  const [aboutBody, setAboutBody] = useState<Record<Lang, string>>({ pt: "", en: "", es: "" });
  const [aboutSections, setAboutSections] = useState<AboutSection[]>([]);
  const [aboutSaving, setAboutSaving] = useState(false);
  const [aboutLang, setAboutLang] = useState<Lang>("pt");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/about");
        if (!res.ok) return;
        const data = await res.json();
        setAboutTitle(normalizeText(data?.title || "Sobre o projeto"));
        setAboutBody(normalizeText(data?.body || ""));
        const sections = Array.isArray(data?.sections) ? data.sections : [];
        setAboutSections(
          sections.map((s: { id?: string; title?: unknown; body?: unknown }, idx: number) => ({
            id: (s?.id || `section-${idx}-${Date.now()}`).toString(),
            title: normalizeText(s?.title),
            body: normalizeText(s?.body),
          }))
        );
      } catch {
        // ignore
      }
    })();
  }, []);

  async function saveAbout() {
    setAboutSaving(true);
    try {
      const res = await fetch("/api/admin/about", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: aboutTitle, body: aboutBody, sections: aboutSections }),
      });
      if (!res.ok) {
        setToast("Falha ao salvar Sobre");
      } else {
        setToast("Sobre salvo ✓");
      }
    } catch {
      setToast("Falha ao salvar Sobre");
    } finally {
      setAboutSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 sm:px-10 lg:px-12">
      <div className="mb-6 text-sm uppercase tracking-[0.18em] text-zinc-400">Sobre</div>

      <div className="rounded-none border border-zinc-800 bg-zinc-950/30 p-5">
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span>Idioma:</span>
          {(["pt", "es", "en"] as Lang[]).map((code) => (
            <button
              key={code}
              onClick={() => setAboutLang(code)}
              className={[
                "rounded-none border px-2 py-1 text-[11px]",
                aboutLang === code
                  ? "border-zinc-600 bg-zinc-900 text-zinc-200"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700",
              ].join(" ")}
            >
              {code}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr] lg:items-start">
          <div>
            <label className="text-xs text-zinc-400">Título</label>
            <input
              value={aboutTitle[aboutLang] || ""}
              onChange={(e) =>
                setAboutTitle((prev) => ({ ...prev, [aboutLang]: e.target.value }))
              }
              className="mt-1 w-full rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400">Texto</label>
            <textarea
              value={aboutBody[aboutLang] || ""}
              onChange={(e) =>
                setAboutBody((prev) => ({ ...prev, [aboutLang]: e.target.value }))
              }
              rows={6}
              className="mt-1 w-full rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <div className="mt-2 text-xs text-zinc-500">
              Use quebras de linha para separar parágrafos.
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-zinc-800 pt-4">
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Seções adicionais</div>
          <div className="mt-4 space-y-4">
            {aboutSections.map((section, idx) => (
              <div key={section.id} className="rounded-none border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr] lg:items-start">
                  <div>
                    <label className="text-xs text-zinc-400">Título</label>
                    <input
                      value={section.title[aboutLang] || ""}
                      onChange={(e) => {
                        const next = [...aboutSections];
                        next[idx] = {
                          ...next[idx],
                          title: { ...next[idx].title, [aboutLang]: e.target.value },
                        };
                        setAboutSections(next);
                      }}
                      className="mt-1 w-full rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-zinc-400">Texto</label>
                    <textarea
                      value={section.body[aboutLang] || ""}
                      onChange={(e) => {
                        const next = [...aboutSections];
                        next[idx] = {
                          ...next[idx],
                          body: { ...next[idx].body, [aboutLang]: e.target.value },
                        };
                        setAboutSections(next);
                      }}
                      rows={4}
                      className="mt-1 w-full rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      const next = aboutSections.filter((_, i) => i !== idx);
                      setAboutSections(next);
                    }}
                    className="rounded-none border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs hover:border-zinc-700"
                  >
                    Remover seção
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <button
              onClick={() =>
                setAboutSections((prev) => [
                  ...prev,
                  {
                    id: `section-${Date.now()}`,
                    title: { pt: "", en: "", es: "" },
                    body: { pt: "", en: "", es: "" },
                  },
                ])
              }
              className="rounded-none border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
            >
              + Adicionar seção
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          {toast ? <span className="text-xs text-zinc-400">{toast}</span> : null}
          <button
            onClick={saveAbout}
            disabled={aboutSaving}
            className="rounded-none border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-700 disabled:opacity-60"
          >
            {aboutSaving ? "Salvando…" : "Salvar Sobre"}
          </button>
        </div>
      </div>
    </div>
  );
}
