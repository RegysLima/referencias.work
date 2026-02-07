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
      <div className="mx-auto w-full max-w-6xl px-6 pb-4 pt-8 sm:px-10 lg:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm uppercase tracking-[0.18em] text-zinc-400">Admin</div>
          <nav className="flex items-center gap-4 text-sm text-zinc-400">
            <Link href="/admin" className="hover:text-zinc-200">
              Referencias
            </Link>
            <span className="text-zinc-700">/</span>
            <Link href="/admin/about" className="hover:text-zinc-200">
              Sobre
            </Link>
            <span className="text-zinc-700">/</span>
            <Link href="/admin/analytics" className="hover:text-zinc-200">
              Analytics
            </Link>
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
