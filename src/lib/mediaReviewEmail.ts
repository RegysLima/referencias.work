import { Resend } from "resend";
import { isRecognizedVideoUrl } from "./mediaHealth";

export type MediaReviewEmailItem = {
  id: string;
  name: string;
  referenceUrl: string;
  outcome: "replaced" | "missing";
  previousUrl: string;
  replacementUrl: string | null;
};

export type MediaReviewEmailReport = {
  ranAt: string;
  adminUrl: string;
  items: MediaReviewEmailItem[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatRunDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function renderMediaReviewEmail(report: MediaReviewEmailReport) {
  const count = report.items.length;
  const rows = report.items
    .map((item) => {
      const replaced = item.outcome === "replaced" && item.replacementUrl;
      const isVideo = replaced && isRecognizedVideoUrl(item.replacementUrl || "");
      const status = replaced ? "Mídia substituída" : "Sem substituição automática";
      const preview = isVideo
        ? `<div style="border:1px solid #2a2a2a;background:#111111;padding:42px 20px;text-align:center;color:#bdbdbd;font-size:12px;">VÍDEO DE PROJETO SELECIONADO<br><a href="${escapeHtml(item.replacementUrl || "")}" style="display:inline-block;margin-top:10px;color:#ffffff;">Abrir vídeo</a></div>`
        : replaced
        ? `<img src="${escapeHtml(item.replacementUrl || "")}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;max-height:310px;object-fit:cover;border:1px solid #2a2a2a;background:#111111;" />`
        : `<div style="border:1px solid #2a2a2a;background:#111111;padding:42px 20px;text-align:center;color:#777777;font-size:12px;">SEM MÍDIA DISPONÍVEL</div>`;

      return `
        <tr>
          <td style="padding:0 0 28px 0;">
            ${preview}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding:14px 0 5px;color:#ffffff;font-size:16px;font-weight:600;">${escapeHtml(item.name)}</td>
              </tr>
              <tr>
                <td style="padding:0 0 10px;color:#8a8a8a;font-size:12px;word-break:break-all;">
                  <a href="${escapeHtml(item.referenceUrl)}" style="color:#8a8a8a;text-decoration:none;">${escapeHtml(item.referenceUrl)}</a>
                </td>
              </tr>
              <tr>
                <td>
                  <span style="display:inline-block;border:1px solid ${replaced ? "#356b4a" : "#7f3434"};padding:5px 8px;color:${replaced ? "#bde9cb" : "#f1b7b7"};font-size:11px;">${status}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mídias aguardando revisão</title></head>
  <body style="margin:0;background:#080808;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#080808;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:600px;">
            <tr>
              <td style="padding:0 0 28px;border-bottom:1px solid #2a2a2a;">
                <div style="font-size:13px;color:#9a9a9a;margin-bottom:10px;">referencias.work / manutenção de mídias</div>
                <div style="font-size:27px;line-height:1.2;font-weight:600;">${count} ${count === 1 ? "referência aguarda" : "referências aguardam"} revisão</div>
                <div style="font-size:12px;color:#777777;margin-top:10px;">Execução: ${escapeHtml(formatRunDate(report.ranAt))}</div>
              </td>
            </tr>
            <tr><td style="padding:28px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table></td></tr>
            <tr>
              <td style="padding:4px 0 32px;">
                <a href="${escapeHtml(report.adminUrl)}" style="display:inline-block;background:#ffffff;color:#000000;padding:12px 18px;text-decoration:none;font-size:13px;font-weight:600;">Revisar no admin</a>
              </td>
            </tr>
            <tr><td style="padding-top:20px;border-top:1px solid #2a2a2a;color:#666666;font-size:11px;line-height:1.5;">As referências foram ocultadas automaticamente e só voltarão ao site após sua aprovação.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderMediaReviewText(report: MediaReviewEmailReport) {
  const items = report.items
    .map((item) => {
      const status = item.outcome === "replaced"
        ? `Substituída por: ${item.replacementUrl}`
        : "Sem substituição automática";
      return `${item.name}\n${item.referenceUrl}\n${status}`;
    })
    .join("\n\n");
  return `${report.items.length} mídias aguardam revisão\n\n${items}\n\nRevisar: ${report.adminUrl}`;
}

export async function sendMediaReviewEmail(
  report: MediaReviewEmailReport,
  idempotencyKey: string
) {
  if (!report.items.length) return { sent: false, id: null };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const resend = new Resend(apiKey);
  const emailDomain = process.env.RESEND_EMAIL_DOMAIN || "referencias.work";
  const from = process.env.MEDIA_REVIEW_EMAIL_FROM || `Referencias.work <alertas@${emailDomain}>`;
  const to = process.env.MEDIA_REVIEW_EMAIL_TO || "regyslima07@gmail.com";
  const { data, error } = await resend.emails.send(
    {
      from,
      to,
      subject: `${report.items.length} ${report.items.length === 1 ? "mídia aguarda" : "mídias aguardam"} revisão`,
      html: renderMediaReviewEmail(report),
      text: renderMediaReviewText(report),
    },
    { idempotencyKey }
  );

  if (error) throw new Error(`Resend: ${error.message}`);
  return { sent: true, id: data?.id || null };
}
