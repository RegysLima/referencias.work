import { Suspense } from "react";
import { loadAbout } from "@/lib/loadAbout";
import AboutHeader from "@/components/AboutHeader";
import AboutContent from "@/components/AboutContent";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import type { Lang } from "@/lib/i18n";

export const revalidate = 300;

function AboutContentFallback() {
  return (
    <div className="mx-auto w-full px-6 pb-16 pt-10 sm:px-10 lg:px-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,680px)_260px] lg:items-start">
        <div className="h-8 w-40 animate-pulse rounded bg-zinc-200" />
        <div className="space-y-4">
          <div className="h-5 w-full animate-pulse rounded bg-zinc-200" />
          <div className="h-5 w-[92%] animate-pulse rounded bg-zinc-200" />
          <div className="h-5 w-[84%] animate-pulse rounded bg-zinc-200" />
        </div>
      </div>
    </div>
  );
}

async function SobreContent({ lang }: { lang: Lang }) {
  const about = await loadAbout();
  return <AboutContent about={about} initialLang={lang} />;
}

export default function SobrePage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const langParam = (searchParams?.lang as Lang) || "pt";
  const lang = (["pt", "en", "es"] as Lang[]).includes(langParam) ? langParam : "pt";

  return (
    <main className="min-h-screen bg-white text-zinc-950 pt-10">
      <AnalyticsTracker />
      <AboutHeader initialLang={lang} />
      <Suspense fallback={<AboutContentFallback />}>
        <SobreContent lang={lang} />
      </Suspense>
    </main>
  );
}
