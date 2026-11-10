import { PRIVATE } from "@/lib/seo";
import { Logo } from "@/components/logo";
import { AcceptInvitation } from "@/components/dashboard/team-panel";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { getSession } from "@/lib/auth";
import { getInvitation } from "@/lib/team";
import { Button } from "@talestudio/ui/button";
import Link from "next/link";


export const metadata = PRIVATE;

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [t, inv, session] = await Promise.all([getDictionary(), getInvitation(token), getSession()]);
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted p-6">
      <Logo />
      <div className="w-full max-w-md rounded-lg border bg-card p-8">
        {!inv ? (
          <p className="text-sm">{t.invite.invalid}</p>
        ) : (
          <div className="grid gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">{fmt(t.invite.title, { workspace: inv.organization.name })}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{fmt(t.invite.body, { role: t.roles[inv.role] })}</p>
            </div>
            {session ? (
              <AcceptInvitation token={token} />
            ) : (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">{fmt(t.invite.signInFirst, { email: inv.email })}</p>
                <div className="flex gap-2">
                  <Button asChild><Link href={`/sign-up?email=${encodeURIComponent(inv.email)}&next=${next}`}>{t.auth.createAccount}</Link></Button>
                  <Button asChild variant="outline"><Link href={`/sign-in?email=${encodeURIComponent(inv.email)}&next=${next}`}>{t.auth.signIn}</Link></Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
