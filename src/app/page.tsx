import AnalyticsTracker from "@/components/AnalyticsTracker";
import Directory from "@/components/Directory";
import { headers } from "next/headers";
import { langFromCountryCode } from "@/lib/geoLang";
import { loadReferences } from "@/lib/loadReferences";

export const revalidate = 300;

export default async function Page() {
  const db = await loadReferences();
  const h = await headers();
  const initialLang = langFromCountryCode(h.get("x-vercel-ip-country"));

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <AnalyticsTracker />
      <Directory
        items={db.items as unknown as Record<string, unknown>[]}
        initialLang={initialLang}
      />
    </main>
  );
}
