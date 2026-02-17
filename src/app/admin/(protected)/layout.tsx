import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminToken } from "@/lib/adminAuth";
import Link from "next/link";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("rw_admin")?.value;

  const secret = process.env.ADMIN_SECRET || "";
  const ok = verifyAdminToken(token, secret);

  if (!ok) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-7xl px-6 pt-8 sm:px-10 lg:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-2xl font-semibold">Admin</div>
          <nav className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <Link href="/" target="_blank" rel="noreferrer" className="hover:text-zinc-200">
              Home
            </Link>
            <span className="text-zinc-700">/</span>
            <Link href="/admin" className="hover:text-zinc-200">
              Referências
            </Link>
            <span className="text-zinc-700">/</span>
            <Link href="/admin/about" className="hover:text-zinc-200">
              Sobre
            </Link>
            <span className="text-zinc-700">/</span>
            <Link href="/admin/analytics" className="hover:text-zinc-200">
              Analytics
            </Link>
            <span className="text-zinc-700">/</span>
            <Link href="/admin/prospects" className="hover:text-zinc-200">
              Prospects
            </Link>
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
