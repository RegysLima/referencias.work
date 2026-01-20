import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminToken } from "@/lib/adminAuth";

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

  return <>{children}</>;
}
