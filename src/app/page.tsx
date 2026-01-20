import Directory from "@/components/Directory";
import { loadReferences } from "@/lib/loadReferences";

export const revalidate = 0;

export default async function Page() {
  const db = await loadReferences();
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <Directory items={db.items as unknown as Record<string, unknown>[]} />
    </main>
  );
}
