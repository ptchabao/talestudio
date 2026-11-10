import { TopupForm } from "@/components/dashboard/topup-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { Tariffs } from "@/components/tariffs";
import { fmt } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { cinetpayEnabled } from "@/lib/cinetpay";
import { requireWorkspace } from "@/lib/workspace";
import { can, episodeTokenCost, TOPUP } from "@talestudio/core";
import { db, desc, eq, schema } from "@talestudio/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@talestudio/ui/card";
import { cn } from "@talestudio/ui/lib/utils";

export async function generateMetadata() {
  return { title: (await getDictionary()).wallet.title };
}

const EPISODE_60S = episodeTokenCost({ durationSec: 60, spokenShotRatio: 0.5, mode: "full" });

export default async function WalletPage({ searchParams }: PageProps<"/dashboard/billing">) {
  const { payment: returned } = await searchParams;
  const [ws, t, locale] = await Promise.all([requireWorkspace(), getDictionary(), getLocale()]);
  const org = ws.org;
  const manage = can(ws.role, "billing:manage");
  const enabled = cinetpayEnabled();
  const [ledger, payments] = await Promise.all([
    db.query.creditLedger.findMany({ where: eq(schema.creditLedger.organizationId, org.id), orderBy: desc(schema.creditLedger.createdAt), limit: 25 }),
    db.query.payment.findMany({ where: eq(schema.payment.organizationId, org.id), orderBy: desc(schema.payment.createdAt), limit: 10 }),
  ]);
  const notice = typeof returned === "string" && returned in t.wallet.returned ? t.wallet.returned[returned as keyof typeof t.wallet.returned] : null;

  return (
    <>
      <PageHeader title={t.wallet.title} description={fmt(t.wallet.subtitle, { workspace: org.name })} />
      <div className="grid gap-6 px-8 py-8">
        {notice && <p role="status" className="rounded-lg border px-4 py-3 text-sm">{notice}</p>}
        {!manage && <p className="rounded-lg bg-muted px-4 py-3 text-sm">{t.wallet.adminOnly}</p>}
        {manage && !enabled && <p className="rounded-lg bg-muted px-4 py-3 text-sm">{t.wallet.disabled}</p>}

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card className="gap-2">
            <CardHeader>
              <CardDescription>{t.wallet.balance}</CardDescription>
              <CardTitle className="font-mono text-4xl">{org.credits.toLocaleString(locale)} TT</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm text-muted-foreground">
              <p>{fmt(t.wallet.value, { fcfa: (org.credits * TOPUP.xofPerToken).toLocaleString("fr-FR") })}</p>
              <p>{fmt(t.wallet.approx, { n: Math.floor(org.credits / EPISODE_60S) })}</p>
              <p className="mt-2 text-xs">{t.wallet.noExpiry}</p>
            </CardContent>
          </Card>
          {manage && (
            <Card>
              <CardHeader><CardTitle>{t.wallet.topUp}</CardTitle><CardDescription>{t.wallet.topUpBody}</CardDescription></CardHeader>
              <CardContent><TopupForm disabled={!enabled} /></CardContent>
            </Card>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader><CardTitle>{t.tariffs.title}</CardTitle><CardDescription>{t.tariffs.subtitle}</CardDescription></CardHeader>
            <CardContent><Tariffs t={t} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.wallet.payments}</CardTitle></CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.wallet.noPayments}</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 text-muted-foreground">{p.createdAt.toLocaleString(locale)}</td>
                        <td className="py-2 font-mono">{p.amountXof.toLocaleString("fr-FR")} F</td>
                        <td className="py-2 font-mono">+{p.tokens} TT</td>
                        <td className={cn("py-2 text-right", p.status === "accepted" ? "text-success" : p.status === "refused" ? "text-destructive" : "text-muted-foreground")}>{t.wallet.status[p.status]}{p.paymentMethod ? ` · ${p.paymentMethod}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>{t.wallet.history}</CardTitle></CardHeader>
          <CardContent>
            {ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.wallet.noActivity}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr><th className="pb-2 font-normal">{t.wallet.date}</th><th className="pb-2 font-normal">{t.wallet.description}</th><th className="pb-2 text-right font-normal">TT</th></tr></thead>
                <tbody className="divide-y">
                  {ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 text-muted-foreground">{l.createdAt.toLocaleString(locale)}</td>
                      <td className="py-2">{t.wallet.reasons[l.reason]}</td>
                      <td className={cn("py-2 text-right font-mono", l.delta > 0 ? "text-success" : "")}>{l.delta > 0 ? `+${l.delta}` : l.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
