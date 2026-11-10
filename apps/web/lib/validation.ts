import "server-only";
import type { ErrorCode } from "@/i18n/config";

export type Failure = { ok: false; status: number; code: ErrorCode; error: string; params?: Record<string, string | number> };
export const fail = (status: number, code: ErrorCode, error: string, params?: Failure["params"]): Failure => ({ ok: false, status, code, error, params });

/** Zod issues → stable code + the list of offending fields (the UI names them in the user's language). */
export function invalidInput(issues: { path: PropertyKey[]; message: string }[]): Failure {
  const fields = [...new Set(issues.map((i) => String(i.path.at(-1) ?? "")))].filter(Boolean);
  return fail(400, "invalid_input", issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), { fields: fields.join(",") });
}
