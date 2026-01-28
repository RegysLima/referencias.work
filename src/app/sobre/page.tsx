import { loadAbout } from "@/lib/loadAbout";
import AboutHeader from "@/components/AboutHeader";
import type { Lang } from "@/lib/i18n";

export const revalidate = 0;

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
  const lang = (searchParams?.lang as Lang) || "pt";
  const paragraphs = splitParagraphs(pickText(about.body, lang));
  const sections = Array.isArray(about.sections) ? about.sections : [];

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <AboutHeader initialLang={lang} />
      <div className="mx-auto w-full px-6 pb-16 pt-10 sm:px-10 lg:px-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr] lg:items-start">
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
                <div key={section.id || `${idx}-${title}`} className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr] lg:items-start">
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
      </div>
    </main>
  );
}
