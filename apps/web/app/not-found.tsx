import { getDictionary } from "@/i18n/server";
import { Button } from "@talestudio/ui/button";
import Link from "next/link";

export default async function NotFound() {
  const t = await getDictionary();
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold">{t.notFound.title}</h1>
        <Button asChild className="mt-6"><Link href="/">{t.notFound.back}</Link></Button>
      </div>
    </div>
  );
}
