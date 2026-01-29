"use client";

import { useSearchParams } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import type { AboutContent } from "@/lib/loadAbout";

function splitParagraphs(text: string) {
  return text
    .split(/\n\s*\n/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function pickText(value: Record<Lang, string> | undefined, lang: Lang) {
  if (!value) return "";
  return value[lang] || value.pt || "";
}

export default function AboutContent({
  about,
  initialLang,
}: {
  about: AboutContent;
  initialLang: Lang;
}) {
  const searchParams = useSearchParams();
  const langParam = searchParams.get("lang");
  const lang = (["pt", "en", "es"] as Lang[]).includes(langParam as Lang)
    ? (langParam as Lang)
    : initialLang;
  const paragraphs = splitParagraphs(pickText(about.body, lang));
  const sections = Array.isArray(about.sections) ? about.sections : [];

  return (
    <div className="mx-auto w-full px-6 pb-16 pt-10 sm:px-10 lg:px-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,680px)_260px] lg:items-start">
        <div className="text-[22px] tracking-[0.02em] text-zinc-900">
          {pickText(about.title, lang) ||
            (lang === "en"
              ? "About the project"
              : lang === "es"
              ? "Sobre el proyecto"
              : "Sobre o projeto")}
        </div>
        <div className="space-y-6 text-[18px] leading-relaxed text-zinc-700">
          {paragraphs.length ? (
            paragraphs.map((p, idx) => <p key={`${idx}-${p.slice(0, 12)}`}>{p}</p>)
          ) : (
            <p>{lang === "en" ? "Coming soon." : lang === "es" ? "Próximamente." : "Em breve."}</p>
          )}
        </div>
      </div>

      {sections.length ? (
        <div className="mt-12 border-t border-zinc-200 pt-10 space-y-10">
          {sections.map((section, idx) => {
            const title = pickText(section.title, lang);
            const body = splitParagraphs(pickText(section.body, lang));
            if (!title && !body.length) return null;
            return (
              <div
                key={section.id || `${idx}-${title}`}
                className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,680px)_260px] lg:items-start"
              >
                <div className="text-[20px] tracking-[0.02em] text-zinc-900">
                  {title || (lang === "en" ? "Section" : "Seção")}
                </div>
                <div className="space-y-6 text-[18px] leading-relaxed text-zinc-700">
                  {body.length ? (
                    body.map((p, i) => <p key={`${idx}-${i}-${p.slice(0, 12)}`}>{p}</p>)
                  ) : (
                    <p>{lang === "en" ? "Coming soon." : lang === "es" ? "Próximamente." : "Em breve."}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

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
    </div>
  );
}
