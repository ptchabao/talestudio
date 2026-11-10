import "server-only";

/**
 * Transactional email through Resend's HTTP API (no SDK needed).
 * Without RESEND_API_KEY, nothing is sent and callers fall back to showing the link.
 */
export async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "TaleStudio <noreply@talestudio.app>", to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
  });
  if (!res.ok) {
    console.error(`[email] Resend ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/** Minimal, client-safe HTML: one ember button, system fonts. */
export function actionEmail({ title, body, cta, url, footer }: { title: string; body: string; cta: string; url: string; footer: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f3f3f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:32px">
<tr><td style="font-size:17px;font-weight:600;letter-spacing:-0.03em">TaleStudio</td></tr>
<tr><td style="padding-top:24px;font-size:22px;font-weight:600;letter-spacing:-0.02em">${esc(title)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.5;color:#60646c">${esc(body)}</td></tr>
<tr><td style="padding-top:24px"><a href="${esc(url)}" style="display:inline-block;background:#ff5900;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px">${esc(cta)}</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#8b8d98">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return { html, text: `${title}\n\n${body}\n\n${cta}: ${url}\n\n${footer}` };
}
