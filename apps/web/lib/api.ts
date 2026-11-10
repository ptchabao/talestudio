import "server-only";
import { NextResponse } from "next/server";
import type { ErrorCode } from "@/i18n/config";
import { getSession } from "./auth";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/**
 * Error contract: `code` is stable and translated by the UI (t.errors[code] + params);
 * `error` is an English message for logs and API consumers.
 */
export const problem = (status: number, code: ErrorCode, message: string, params?: Record<string, string | number>) =>
  NextResponse.json({ code, error: message, params }, { status });

/** Turn a service result into a response: `{ ok: true, ...data }` → 200/201 JSON, Failure → problem. */
export function respond<T extends { ok: true }>(res: T | { ok: false; status: number; code: ErrorCode; error: string; params?: Record<string, string | number> }, okStatus = 200) {
  if (!res.ok) return problem(res.status, res.code, res.error, res.params);
  const { ok: _ok, ...data } = res;
  return json(data, okStatus);
}

export async function apiUser() {
  const session = await getSession();
  return session?.user ?? null;
}
