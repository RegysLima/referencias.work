import { loadAbout } from "@/lib/loadAbout";
import AboutHeader from "@/components/AboutHeader";
import type { Lang } from "@/lib/i18n";

export const revalidate = 0;
export const dynamic = "force-dynamic";

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

export default async function SobrePage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const about = await loadAbout();
  const langParam = (searchParams?.lang as Lang) || "pt";
  const lang = (["pt", "en", "es"] as Lang[]).includes(langParam) ? langParam : "pt";
  const paragraphs = splitParagraphs(pickText(about.body, lang));
  const sections = Array.isArray(about.sections) ? about.sections : [];

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <div className="pt-10">
        <AboutHeader initialLang={lang} />
      </div>
      <div className="mx-auto w-full px-6 pb-16 pt-10 sm:px-10 lg:px-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,680px)_260px] lg:items-start">
          <div className="text-[22px] tracking-[0.02em] text-zinc-900">
            {pickText(about.title, lang) || (lang === "en" ? "About the project" : lang === "es" ? "Sobre el proyecto" : "Sobre o projeto")}
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
                <div key={section.id || `${idx}-${title}`} className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,680px)_260px] lg:items-start">
                  <div className="text-[20px] tracking-[0.02em] text-zinc-900">
                    {title || (lang === "en" ? "Section" : "Seção")}
                  </div>
                  <div className="space-y-6 text-[18px] leading-relaxed text-zinc-700">
                    {body.length
                      ? body.map((p, i) => <p key={`${idx}-${i}-${p.slice(0, 12)}`}>{p}</p>)
                      : <p>{lang === "en" ? "Coming soon." : lang === "es" ? "Próximamente." : "Em breve."}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <footer className="mt-16 border-t border-zinc-200 pt-6">
          <div className="flex flex-col gap-4 text-[14px] text-zinc-600 sm:flex-row sm:items-start sm:justify-between">
            <div>Projeto desenvolvido por Regys Lima</div>
            <div className="text-zinc-600">
              <a
                href="https://regys.design/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-600"
              >
                Portfólio
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
                Linkedin
              </a>
              <span className="text-zinc-400">, </span>
              <a
                href="mailto:regyslima07@gmail.com"
                className="underline decoration-zinc-400/50 underline-offset-4 hover:decoration-zinc-600"
              >
                Contato
              </a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
