"use client";

import { useI18n } from "@/i18n/client";
import { errorMessage, fmt } from "@/i18n/config";
import { tokensForXof, TOPUP, validTopupXof } from "@talestudio/core";
import { Button } from "@talestudio/ui/button";
import { Input, Label } from "@talestudio/ui/input";
import { cn } from "@talestudio/ui/lib/utils";
import { Loader2 } from "lucide-react";
import { useState } from "react";

/** Any amount from the minimum: presets are shortcuts, not packs. Redirects to CinetPay. */
export function TopupForm({ disabled }: { disabled: boolean }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState<number>(TOPUP.presetsXof[1]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = validTopupXof(amount);

  async function pay() {
    if (!valid) return;
    setPending(true);
    setError(null);
    const res = await fetch("/api/wallet/topup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountXof: valid }) });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.url) {
      setPending(false);
      return setError(errorMessage(t, body));
    }
    window.location.href = body.url;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {TOPUP.presetsXof.map((p) => (
          <button key={p} type="button" aria-pressed={amount === p} onClick={() => setAmount(p)} className={cn("h-9 rounded-lg border px-3 font-mono text-sm", amount === p ? "border-foreground font-semibold" : "text-muted-foreground hover:bg-muted")}>
            {p.toLocaleString("fr-FR")} F
          </button>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="amount">{t.wallet.otherAmount}</Label>
        <Input id="amount" type="number" inputMode="numeric" min={TOPUP.minXof} max={TOPUP.maxXof} step={TOPUP.stepXof} value={Number.isFinite(amount) ? amount : ""} onChange={(e) => setAmount(e.target.valueAsNumber)} />
        <p className="text-xs text-pewter">{fmt(t.wallet.limits, { min: TOPUP.minXof.toLocaleString("fr-FR"), max: TOPUP.maxXof.toLocaleString("fr-FR") })}</p>
      </div>
      <div className="flex items-baseline justify-between rounded-lg bg-muted px-4 py-3 text-sm">
        <span className="text-muted-foreground">{t.wallet.youGet}</span>
        <span className="font-mono text-lg font-semibold">{valid ? `${tokensForXof(valid).toLocaleString("fr-FR")} TT` : "—"}</span>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button size="lg" disabled={disabled || !valid || pending} onClick={pay}>
        {pending && <Loader2 className="animate-spin" />}
        {valid ? fmt(t.wallet.pay, { amount: valid.toLocaleString("fr-FR") }) : t.wallet.pay.replace(" {amount} FCFA", "")}
      </Button>
      <p className="text-xs text-pewter">{t.wallet.methods}</p>
    </div>
  );
}
