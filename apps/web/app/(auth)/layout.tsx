import { Logo } from "@/components/logo";
import { Preferences } from "@/components/preferences";
import { PRIVATE } from "@/lib/seo";

export const metadata = PRIVATE;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted p-6">
      <Preferences className="absolute top-4 right-4" />
      <Logo />
      {children}
    </div>
  );
}
