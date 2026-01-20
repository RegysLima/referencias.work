import crypto from "node:crypto";

export function verifyAdminToken(token: string | undefined, secret: string) {
  if (!token || !secret) return false;

  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [payload, sig] = raw.split(".");
    if (!payload || !sig) return false;

    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (expected !== sig) return false;

    const data = JSON.parse(payload);
    const ts = Number(data?.ts || 0);
    if (!ts) return false;

    const ageMs = Date.now() - ts;
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 dias
    if (ageMs > maxAgeMs) return false;

    return true;
  } catch {
    return false;
  }
}
