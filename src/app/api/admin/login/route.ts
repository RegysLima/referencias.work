import { NextResponse } from "next/server";
import crypto from "node:crypto";

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function POST(req: Request) {
  const { password } = await req.json();

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
  const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

  if (!ADMIN_PASSWORD || !ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "ENV missing" }, { status: 500 });
  }

  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const payload = JSON.stringify({ ts: Date.now() });
  const sig = sign(payload, ADMIN_SECRET);
  const token = Buffer.from(`${payload}.${sig}`).toString("base64url");

  const res = NextResponse.json({ ok: true });
  res.cookies.set("rw_admin", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // local
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  });

  return res;
}
