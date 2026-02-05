import { NextResponse } from "next/server";

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getFilenameFromUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const base = url.pathname.split("/").filter(Boolean).pop();
    if (base) return sanitizeFilename(base);
  } catch {
    // ignore
  }
  return "thumbnail.jpg";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return NextResponse.json({ ok: false, error: "Invalid protocol" }, { status: 400 });
  }

  const res = await fetch(target.toString(), { redirect: "follow" });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: "Fetch failed" }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const filename = getFilenameFromUrl(target.toString());
  const body = await res.arrayBuffer();

  return new Response(body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
