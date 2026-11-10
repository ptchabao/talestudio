import { appUrl } from "@/lib/url";
import { settlePayment } from "@/lib/wallet";

/**
 * Where CinetPay sends the customer back (GET or POST). Settling here too means the balance is right even when
 * the notification is late or cannot reach us (local dev).
 */
async function handle(req: Request) {
  const tx = new URL(req.url).searchParams.get("tx");
  const status = tx ? await settlePayment(tx).catch(() => "pending" as const) : "unknown";
  return Response.redirect(`${appUrl()}/dashboard/billing?payment=${status}`, 303);
}

export const GET = handle;
export const POST = handle;
