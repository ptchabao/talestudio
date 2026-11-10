import "server-only";
import { db, schema } from "@talestudio/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createWorkspace } from "./workspace-admin";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  socialProviders: process.env.GOOGLE_CLIENT_ID
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "" } }
    : undefined,
  session: { cookieCache: { enabled: true, maxAge: 60 } },
  databaseHooks: {
    user: {
      create: {
        // Every account starts with a personal workspace (owner) and the free plan's credits.
        after: async (u) => {
          await createWorkspace({ userId: u.id, name: u.name, personal: true });
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** For server components / actions behind auth. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}
