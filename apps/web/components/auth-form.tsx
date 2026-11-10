"use client";

import { useI18n } from "@/i18n/client";
import { authErrorMessage } from "@/i18n/config";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@talestudio/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@talestudio/ui/card";
import { Input, Label } from "@talestudio/ui/input";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode, googleEnabled }: { mode: "sign-in" | "sign-up"; googleEnabled: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const params = useSearchParams();
  const plan = params.get("plan");
  const next = params.get("next") ?? (plan ? `/dashboard/billing?plan=${plan}` : "/dashboard");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const res =
      mode === "sign-up"
        ? await signUp.email({ email, password, name: String(f.get("name") || email.split("@")[0]) })
        : await signIn.email({ email, password });
    setPending(false);
    if (res.error) return setError(authErrorMessage(t, res.error));
    router.push(next);
    router.refresh();
  }

  const isUp = mode === "sign-up";
  return (
    <Card className="w-full max-w-sm px-2">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{isUp ? t.auth.signUpTitle : t.auth.signInTitle}</CardTitle>
        <CardDescription>{isUp ? t.auth.signUpSubtitle : t.auth.signInSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {googleEnabled && (
          <>
            <Button variant="outline" type="button" onClick={() => signIn.social({ provider: "google", callbackURL: next })}>
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden><path fill="currentColor" d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.08 1.08-2.76 2.25-5.71 2.25-4.6 0-8.2-3.71-8.2-8.31s3.6-8.31 8.2-8.31c2.48 0 4.3.98 5.63 2.24l2.31-2.31C18.75 1.62 16.07.4 12.48.4 6.15.4.96 5.48.96 11.8s5.19 11.4 11.52 11.4c3.42 0 6-1.12 8.02-3.22 2.07-2.07 2.72-4.98 2.72-7.34 0-.73-.06-1.4-.17-1.72H12.48Z"/></svg>
              {t.auth.google}
            </Button>
            <div className="relative text-center text-xs text-muted-foreground after:absolute after:inset-x-0 after:top-1/2 after:-z-10 after:border-t">
              <span className="bg-card px-2">{t.auth.or}</span>
            </div>
          </>
        )}
        <form onSubmit={onSubmit} className="grid gap-4">
          {isUp && (
            <div className="grid gap-2">
              <Label htmlFor="name">{t.auth.name}</Label>
              <Input id="name" name="name" autoComplete="name" placeholder={t.auth.namePlaceholder} />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={params.get("email") ?? ""} placeholder="you@studio.com" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">{t.auth.password}</Label>
            <Input id="password" name="password" type="password" autoComplete={isUp ? "new-password" : "current-password"} required minLength={8} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <Loader2 className="animate-spin" />}
            {isUp ? t.auth.createAccount : t.auth.signIn}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {isUp ? t.auth.haveAccount : t.auth.noAccount}{" "}
          <Link href={isUp ? "/sign-in" : `/sign-up${plan ? `?plan=${plan}` : ""}`} className="font-medium text-foreground underline underline-offset-4">
            {isUp ? t.auth.signIn : t.auth.createOne}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
