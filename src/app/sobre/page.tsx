import { loadAbout } from "@/lib/loadAbout";
import AboutHeader from "@/components/AboutHeader";
import AboutContent from "@/components/AboutContent";
import type { Lang } from "@/lib/i18n";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function SobrePage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const about = await loadAbout();
  const langParam = (searchParams?.lang as Lang) || "pt";
  const lang = (["pt", "en", "es"] as Lang[]).includes(langParam) ? langParam : "pt";

  return (
    <main className="min-h-screen bg-white text-zinc-950 pt-10">
      <AboutHeader initialLang={lang} />
      <AboutContent about={about} initialLang={lang} />
    </main>
  );
}
