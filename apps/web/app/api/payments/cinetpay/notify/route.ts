import { validNotification } from "@/lib/cinetpay";
import { settlePayment } from "@/lib/wallet";

/** CinetPay pings the notification URL with GET to check it is reachable. */
export function GET() {
  return new Response("ok");
}

/**
 * Payment notification (form-encoded). The body only tells us which transaction moved; settlePayment asks
 * CinetPay for the real status. A 5xx makes CinetPay retry later.
 */
export async function POST(req: Request) {
  const form = new URLSearchParams(await req.text());
  if (!validNotification(form, req.headers.get("x-token"))) return new Response("invalid signature", { status: 401 });
  const tx = form.get("cpm_trans_id");
  if (!tx || form.get("cpm_site_id") !== process.env.CINETPAY_SITE_ID) return new Response("ignored");
  try {
    await settlePayment(tx);
    return new Response("ok");
  } catch (err) {
    console.error(`[cinetpay] notify ${tx}`, err);
    return new Response("retry later", { status: 503 });
  }
}
