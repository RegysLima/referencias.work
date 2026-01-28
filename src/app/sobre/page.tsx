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
      </div>
    </main>
  );
}
