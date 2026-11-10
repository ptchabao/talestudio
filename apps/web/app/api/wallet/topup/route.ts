import { respond } from "@/lib/api";
import { startTopup } from "@/lib/wallet";
import { apiWorkspace } from "@/lib/workspace";

/** Start a wallet top-up of any amount: returns the CinetPay payment page to redirect to. */
export async function POST(req: Request) {
  const { ws, error } = await apiWorkspace("billing:manage");
  if (error) return error;
  return respond(await startTopup(ws, await req.json().catch(() => null)));
}
