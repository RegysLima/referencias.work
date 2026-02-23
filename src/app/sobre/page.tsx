import { loadAbout } from "@/lib/loadAbout";
import AboutHeader from "@/components/AboutHeader";
import AboutContent from "@/components/AboutContent";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { headers } from "next/headers";
import { langFromCountryCode } from "@/lib/geoLang";
import type { Lang } from "@/lib/i18n";

export const revalidate = 300;

export default async function SobrePage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const about = await loadAbout();
  const h = await headers();
  const geoLang = langFromCountryCode(h.get("x-vercel-ip-country"));
  const langParam = (searchParams?.lang as Lang) || geoLang;
  const lang = (["pt", "en", "es"] as Lang[]).includes(langParam) ? langParam : geoLang;

  return (
    <main className="min-h-screen bg-white text-zinc-950 pt-10">
      <AnalyticsTracker />
      <AboutHeader initialLang={lang} />
      <AboutContent about={about} initialLang={lang} />
    </main>
  );
}
