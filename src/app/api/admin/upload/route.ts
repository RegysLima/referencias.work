import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Arquivo inválido" }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ ok: false, error: "Arquivo muito grande" }, { status: 413 });
  }

  const name = sanitizeFilename(file.name || "upload");
  const key = `thumbs/${Date.now()}-${name}`;

  const blob = await put(key, file, {
    access: "public",
    contentType: file.type || "application/octet-stream",
  });

  return NextResponse.json({ ok: true, url: blob.url });
}
