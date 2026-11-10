/**
 * Wraps a provider so every call goes to `primary` (Rodium) first and, if it throws, is replayed once on
 * `fallback` (the direct provider). That covers Rodium being down or in maintenance (503), provider errors
 * (502/504), timeouts, rate limits (429), an empty wallet (402 insufficient_balance), key quotas (403) and
 * any feature the gateway doesn't pass through (e.g. missing structured output).
 *
 * Non-retryable errors (a refused premise) are not replayed unless they say another route can help.
 */
export function withFallback<T extends object>(step: string, primary: T, fallback: T | null): T {
  if (!fallback) return primary;
  return new Proxy(primary, {
    get(target, prop, receiver) {
      const method = Reflect.get(target, prop, receiver);
      if (typeof method !== "function") return method;
      return async (...args: unknown[]) => {
        try {
          return await method.apply(target, args);
        } catch (err) {
          if (!shouldFallback(err)) throw err;
          console.warn(`[ai:${step}] Rodium failed, falling back to the direct provider: ${err instanceof Error ? err.message : String(err)}`);
          const backup = Reflect.get(fallback, prop) as (...a: unknown[]) => unknown;
          return backup.apply(fallback, args);
        }
      };
    },
  });
}

function shouldFallback(err: unknown): boolean {
  const e = err as { nonRetryable?: boolean; fallbackable?: boolean } | null;
  return !e?.nonRetryable || Boolean(e.fallbackable);
}
