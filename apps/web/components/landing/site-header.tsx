import { getDictionary } from "@/i18n/server";
import { Button } from "@talestudio/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Logo } from "../logo";
import { Preferences } from "../preferences";

export async function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const t = await getDictionary();
  return (
    <>
      {/* Announcement bar: Carbon, top of page only. */}
      <div className="bg-carbon px-4 py-2 text-center text-xs font-medium text-white">
        {t.announce.text}{" "}
        <Link href="/sign-up" className="inline-flex items-center gap-0.5 text-ember hover:underline">
          {t.announce.link} <ArrowRight className="size-3" />
        </Link>
      </div>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-6">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="#studios" className="hover:text-muted-foreground">{t.nav.studios}</a>
            <a href="#how" className="hover:text-muted-foreground">{t.nav.how}</a>
            <a href="#pricing" className="hover:text-muted-foreground">{t.nav.pricing}</a>
            <a href="#faq" className="hover:text-muted-foreground">{t.nav.faq}</a>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <Preferences className="hidden lg:flex" />
            {signedIn ? (
              <Button asChild size="sm"><Link href="/dashboard">{t.nav.openStudio}</Link></Button>
            ) : (
              <>
                <Link href="/sign-in" className="hidden text-sm font-medium sm:inline">{t.nav.signIn}</Link>
                <Button asChild size="sm"><Link href="/sign-up">{t.nav.startFree}</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
