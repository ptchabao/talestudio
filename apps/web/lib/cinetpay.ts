import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * CinetPay Checkout v2: Mobile Money (T-Money, Flooz, Orange Money, MTN, Moov, Wave…) and cards in FCFA.
 * A notification is only a hint: every status we act on comes from CinetPay's own /payment/check.
 */
const API = (process.env.CINETPAY_API_URL ?? "https://api-checkout.cinetpay.com/v2").replace(/\/$/, "");

export const cinetpayEnabled = () => Boolean(process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID);

function credentials() {
  const apikey = process.env.CINETPAY_API_KEY;
  const site_id = process.env.CINETPAY_SITE_ID;
  if (!apikey || !site_id) throw new Error("CINETPAY_API_KEY / CINETPAY_SITE_ID are not configured");
  return { apikey, site_id };
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...credentials(), ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  return (await res.json().catch(() => null)) as T | null;
}

export async function initPayment(input: {
  transactionId: string;
  amountXof: number;
  description: string;
  notifyUrl: string;
  returnUrl: string;
  customer: { id: string; name: string; email: string };
}): Promise<string> {
  const [first, ...rest] = input.customer.name.trim().split(/\s+/);
  const out = await post<{ code?: string; message?: string; description?: string; data?: { payment_url?: string } }>("/payment", {
    transaction_id: input.transactionId,
    amount: input.amountXof,
    currency: "XOF",
    description: input.description,
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    channels: process.env.CINETPAY_CHANNELS ?? "ALL",
    lang: "fr",
    metadata: input.transactionId,
    customer_id: input.customer.id,
    customer_name: first || input.customer.email,
    customer_surname: rest.join(" ") || first || input.customer.email,
    customer_email: input.customer.email,
  });
  if (out?.code !== "201" || !out.data?.payment_url) throw new Error(`CinetPay init failed: ${out?.code ?? "no response"} ${out?.message ?? ""} ${out?.description ?? ""}`.trim());
  return out.data.payment_url;
}

export interface PaymentStatus {
  status: "ACCEPTED" | "REFUSED" | "PENDING";
  amountXof: number;
  currency: string;
  paymentMethod: string | null;
  operatorId: string | null;
}

export async function checkPayment(transactionId: string): Promise<PaymentStatus> {
  const out = await post<{ code?: string; message?: string; data?: { status?: string; amount?: string | number; currency?: string; payment_method?: string | null; operator_id?: string | null } }>("/payment/check", {
    transaction_id: transactionId,
  });
  const data = out?.data;
  if (!data) throw new Error(`CinetPay check failed: ${out?.code ?? "no response"} ${out?.message ?? ""}`.trim());
  // Anything that is neither final state (waiting for the customer, being processed…) stays pending.
  const status = data.status === "ACCEPTED" ? "ACCEPTED" : data.status === "REFUSED" ? "REFUSED" : "PENDING";
  return { status, amountXof: Number(data.amount), currency: data.currency ?? "", paymentMethod: data.payment_method ?? null, operatorId: data.operator_id ?? null };
}

/** Fields CinetPay concatenates, in this order, for the x-token HMAC of a notification. */
const SIGNED_FIELDS = ["cpm_site_id", "cpm_trans_id", "cpm_trans_date", "cpm_amount", "cpm_currency", "signature", "payment_method", "cel_phone_num", "cpm_phone_prefixe", "cpm_language", "cpm_version", "cpm_payment_config", "cpm_page_action", "cpm_custom", "cpm_designation", "cpm_error_message"];

/** HMAC-SHA256 check of a notification. Without CINETPAY_SECRET_KEY there is nothing to check against. */
export function validNotification(form: URLSearchParams, token: string | null): boolean {
  const secret = process.env.CINETPAY_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const expected = createHmac("sha256", secret).update(SIGNED_FIELDS.map((f) => form.get(f) ?? "").join("")).digest("hex");
  return expected.length === token.length && timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}
