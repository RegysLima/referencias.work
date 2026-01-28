import { loadAbout } from "@/lib/loadAbout";

export const revalidate = 0;

function splitParagraphs(text: string) {
  return text
    .split(/\n\s*\n/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

export default async function SobrePage() {
  const about = await loadAbout();
  const paragraphs = splitParagraphs(about.body || "");
  const sections = Array.isArray(about.sections) ? about.sections : [];

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <div className="mx-auto w-full px-6 pb-16 pt-14 sm:px-10 lg:px-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr] lg:items-start">
          <div className="text-[22px] tracking-[0.02em] text-zinc-900">
            {about.title || "Sobre o projeto"}
          </div>
          <div className="space-y-6 text-[18px] leading-relaxed text-zinc-700">
            {paragraphs.length ? (
              paragraphs.map((p, idx) => <p key={`${idx}-${p.slice(0, 12)}`}>{p}</p>)
            ) : (
              <p>Em breve.</p>
            )}
          </div>
        </div>

        {sections.length ? (
          <div className="mt-12 space-y-10">
            {sections.map((section, idx) => {
              const body = splitParagraphs(section.body || "");
              if (!section.title && !body.length) return null;
              return (
                <div key={section.id || `${idx}-${section.title}`} className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr] lg:items-start">
                  <div className="text-[20px] tracking-[0.02em] text-zinc-900">
                    {section.title || "Seção"}
                  </div>
                  <div className="space-y-6 text-[18px] leading-relaxed text-zinc-700">
                    {body.length ? body.map((p, i) => <p key={`${idx}-${i}-${p.slice(0, 12)}`}>{p}</p>) : <p>Em breve.</p>}
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
