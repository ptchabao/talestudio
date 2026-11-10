import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_HEADER } from "./i18n/config";

const LOCALE_PATH = /^\/(en|fr)$/;

/**
 * - /en and /fr: indexable landing pages, one per language. The language is passed down as a request header.
 * - /dashboard: cheap optimistic gate (cookie presence only). Real authorization happens in each page/route.
 */
export function proxy(req: NextRequest) {
  const lang = LOCALE_PATH.exec(req.nextUrl.pathname)?.[1];
  if (lang) {
    const headers = new Headers(req.headers);
    headers.set(LOCALE_HEADER, lang);
    return NextResponse.next({ request: { headers } });
  }
  if (!getSessionCookie(req)) return NextResponse.redirect(new URL("/sign-in", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/en", "/fr"] };
