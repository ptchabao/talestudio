"use client";

import { useI18n } from "@/i18n/client";
import { signOut } from "@/lib/auth-client";
import type { PlanId, Role } from "@talestudio/core";
import { Button } from "@talestudio/ui/button";
import { cn } from "@talestudio/ui/lib/utils";
import { Check, ChevronsUpDown, CreditCard, FolderOpen, LogOut, Plus, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "../logo";
import { Preferences } from "../preferences";

/** Below this balance (≈ one 60s storyboard) the wallet card nudges towards a top-up. */
const LOW_BALANCE = 300;

interface Props {
  user: { name: string; email: string };
  workspace: { id: string; name: string; personal: boolean; plan: PlanId; credits: number; role: Role; canCreate: boolean };
  memberships: { id: string; name: string; personal: boolean }[];
}

export function Sidebar({ user, workspace, memberships }: Props) {
  const { t, locale } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function switchTo(id: string) {
    setOpen(false);
    if (id === workspace.id) return;
    await fetch("/api/workspaces/switch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    router.push("/dashboard");
    router.refresh();
  }

  const item = (href: string, label: string, Icon: typeof FolderOpen, active: boolean) => (
    <Link key={href} href={href} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", active && "bg-muted text-foreground")}>
      <Icon className="size-4" /> {label}
    </Link>
  );
  const section = (label: string) => <p className="px-2.5 pt-4 pb-1 text-xs font-medium tracking-wide text-steel uppercase">{label}</p>;

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-r bg-background px-3 py-4 md:w-64">
      <div className="px-2.5"><Logo href="/dashboard" /></div>

      {/* Workspace switcher */}
      <div className="relative mt-5">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t.sidebar.switchWorkspace} className="flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left hover:bg-muted">
          <span className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-foreground text-xs font-semibold text-background uppercase">{workspace.name.slice(0, 1)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{workspace.name}</span>
            <span className="block text-xs text-muted-foreground">{workspace.personal ? t.sidebar.personal : t.roles[workspace.role]}</span>
          </span>
          <ChevronsUpDown className="size-4 text-steel" />
        </button>
        {open && (
          <div className="absolute inset-x-0 top-full z-50 mt-1 rounded-lg border bg-popover p-1">
            {memberships.map((m) => (
              <button key={m.id} type="button" onClick={() => switchTo(m.id)} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm hover:bg-muted">
                <span className="min-w-0 flex-1 truncate">{m.name}{m.personal && <span className="text-muted-foreground"> · {t.sidebar.personal}</span>}</span>
                {m.id === workspace.id && <Check className="size-4" />}
              </button>
            ))}
            <Link href="/dashboard/team#new-workspace" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-[8px] border-t px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              <Plus className="size-4" /> {t.sidebar.newWorkspace}
            </Link>
          </div>
        )}
      </div>

      {section(t.sidebar.create)}
      {workspace.canCreate && item("/dashboard/projects/new", t.sidebar.newProject, Plus, path === "/dashboard/projects/new")}
      {section(t.sidebar.library)}
      {item("/dashboard", t.sidebar.projects, FolderOpen, path === "/dashboard" || (path.startsWith("/dashboard/projects") && path !== "/dashboard/projects/new"))}
      {item("/dashboard/characters", t.sidebar.characters, UserRound, path.startsWith("/dashboard/characters"))}
      {section(t.sidebar.workspace)}
      {item("/dashboard/team", t.sidebar.team, Users, path.startsWith("/dashboard/team"))}
      {item("/dashboard/billing", t.sidebar.billing, CreditCard, path.startsWith("/dashboard/billing"))}

      <div className="mt-auto grid grid-cols-[minmax(0,1fr)] gap-3 pt-4">
        <Link href="/dashboard/billing" className="rounded-lg bg-ember p-4 text-white hover:bg-ember/90">
          <p className="text-xs text-white/80">{t.sidebar.credits}</p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{workspace.credits.toLocaleString(locale)}</p>
          {workspace.credits < LOW_BALANCE && <p className="mt-2 text-xs font-medium underline underline-offset-2">{t.sidebar.topUp}</p>}
        </Link>
        <Preferences className="justify-between px-1" />
        <div className="flex items-center gap-2 px-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">{user.name.slice(0, 2)}</span>
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-muted-foreground">{user.email}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label={t.sidebar.signOut} onClick={async () => { await signOut(); router.push("/"); }}>
            <LogOut />
          </Button>
        </div>
      </div>
    </aside>
  );
}
