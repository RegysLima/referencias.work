import Directory from "@/components/Directory";
import { loadReferences } from "@/lib/loadReferences";

export default function Page() {
  const db = loadReferences();
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <Directory items={db.items as unknown as Record<string, unknown>[]} />
    </main>
  );
}
