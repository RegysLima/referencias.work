import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// --- helpers (Edge-safe) ---
function b64urlToUint8Array(b64url: string) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function hmacSha256Hex(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyToken(token: string | undefined, secret: string) {
  if (!token) return false;

  try {
    const raw = new TextDecoder().decode(b64urlToUint8Array(token));
    const [payload, sig] = raw.split(".");
    if (!payload || !sig) return false;

    const expected = await hmacSha256Hex(payload, secret);
    if (expected !== sig) return false;

    const data = JSON.parse(payload);
    const ts = Number(data?.ts || 0);
    if (!ts) return false;

    // expira em 7 dias
    const ageMs = Date.now() - ts;
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) return false;

    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminRoute =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin");

  if (!isAdminRoute) return NextResponse.next();

  // libera o login e assets
  if (pathname === "/admin/login") return NextResponse.next();

  const secret = process.env.ADMIN_SECRET || "";
  const token = req.cookies.get("rw_admin")?.value;

  const ok = secret ? await verifyToken(token, secret) : false;

  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
