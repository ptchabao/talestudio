"use client";

import { useI18n } from "@/i18n/client";
import { errorMessage, fmt } from "@/i18n/config";
import type { Role } from "@talestudio/core";
import { Button } from "@talestudio/ui/button";
import { Input, Label, Select } from "@talestudio/ui/input";
import { Check, Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Member { id: string; role: Role; user: { id: string; name: string; email: string } }
interface Invitation { id: string; email: string; role: Role; expired: boolean; link: string }

export function TeamPanel(props: { meId: string; myRole: Role; personal: boolean; canManage: boolean; assignable: Role[]; members: Member[]; invitations: Invitation[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  async function call(url: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(errorMessage(t, data));
      return null;
    }
    router.refresh();
    return data;
  }

  async function onInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const f = new FormData(e.currentTarget);
    const data = await call("/api/workspaces/invitations", "POST", { email: f.get("email"), role: f.get("role") });
    setPending(false);
    if (data?.link) {
      setLink(data.link);
      setEmailedTo(data.emailed ? String(f.get("email")) : null);
      setCopied(false);
      e.currentTarget?.reset?.();
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  return (
    <div className="grid gap-8">
      {error && <p role="alert" className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive">{error}</p>}

      <section className="rounded-lg border">
        <h2 className="border-b px-6 py-4 font-semibold">{t.team.members}</h2>
        <ul className="divide-y">
          {props.members.map((m) => {
            const me = m.user.id === props.meId;
            const manageable = props.canManage && props.assignable.includes(m.role);
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">{m.user.name.slice(0, 2)}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{m.user.name}{me && <span className="text-muted-foreground"> · {t.team.you}</span>}</p>
                  <p className="truncate text-muted-foreground">{m.user.email}</p>
                </div>
                {manageable && !me ? (
                  <Select aria-label={t.team.role} className="w-36" value={m.role} onChange={(e) => call(`/api/workspaces/members/${m.id}`, "PATCH", { role: e.target.value })}>
                    {props.assignable.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                  </Select>
                ) : (
                  <span className="text-sm text-muted-foreground">{t.roles[m.role]}</span>
                )}
                {(me || manageable) && !props.personal && (
                  <Button variant="ghost" size="sm" onClick={() => call(`/api/workspaces/members/${m.id}`, "DELETE").then((ok) => ok && me && router.push("/dashboard"))}>
                    {me ? t.team.leave : t.team.remove}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {props.personal ? (
        <section className="rounded-lg bg-muted p-6">
          <h2 className="font-semibold">{t.team.personalTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.team.personalBody}</p>
        </section>
      ) : (
        props.canManage && (
          <section className="grid gap-6 rounded-lg border p-6">
            <div>
              <h2 className="font-semibold">{t.team.invite}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.team.inviteBody}</p>
            </div>
            <form onSubmit={onInvite} className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <div className="grid gap-2"><Label htmlFor="invite-email">{t.team.email}</Label><Input id="invite-email" name="email" type="email" required placeholder={t.team.emailPlaceholder} /></div>
              <div className="grid gap-2">
                <Label htmlFor="invite-role">{t.team.role}</Label>
                <Select id="invite-role" name="role" defaultValue="editor">
                  {props.assignable.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                </Select>
              </div>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{t.team.send}</Button>
            </form>
            <ul className="grid gap-1 text-xs text-muted-foreground">
              {props.assignable.map((r) => <li key={r}><span className="font-medium text-foreground">{t.roles[r]}</span> — {t.roles.descriptions[r]}</li>)}
            </ul>
            {link && (
              <div className="grid gap-2 rounded-lg bg-muted p-4 text-sm">
                <p>{emailedTo ? fmt(t.team.emailed, { email: emailedTo }) : t.team.linkReady}</p>
                <div className="flex gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-[8px] border bg-background px-3 py-2 font-mono text-xs">{link}</code>
                  <Button variant="outline" size="sm" onClick={() => copy(link)}>{copied ? <Check /> : <Copy />}{copied ? t.team.copied : t.team.copy}</Button>
                </div>
              </div>
            )}
            {props.invitations.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">{t.team.pending}</h3>
                <ul className="mt-2 divide-y rounded-lg border">
                  {props.invitations.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{i.email}</span>
                      <span className="text-muted-foreground">{i.expired ? t.team.expired : t.roles[i.role]}</span>
                      {!i.expired && <Button variant="ghost" size="sm" onClick={() => copy(i.link)}><Copy /> {t.team.copy}</Button>}
                      <Button variant="ghost" size="sm" onClick={() => call(`/api/workspaces/invitations/${i.id}`, "DELETE")}>{t.team.revoke}</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )
      )}
    </div>
  );
}

export function NewWorkspaceForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: new FormData(e.currentTarget).get("name") }) });
    setPending(false);
    if (!res.ok) return setError(errorMessage(t, await res.json().catch(() => null)));
    router.push("/dashboard/team");
    router.refresh();
  }
  return (
    <section id="new-workspace" className="grid gap-4 rounded-lg border p-6">
      <h2 className="font-semibold">{t.team.newWorkspace}</h2>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2"><Label htmlFor="ws-name">{t.team.workspaceName}</Label><Input id="ws-name" name="name" required minLength={2} maxLength={80} placeholder={t.team.workspacePlaceholder} /></div>
        <Button type="submit" variant="outline" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{t.team.create}</Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

export function AcceptInvitation({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function accept() {
    setPending(true);
    const res = await fetch(`/api/invitations/${token}/accept`, { method: "POST" });
    setPending(false);
    if (!res.ok) return setError(errorMessage(t, await res.json().catch(() => null)));
    router.push("/dashboard");
    router.refresh();
  }
  return (
    <div className="grid gap-3">
      <Button size="lg" onClick={accept} disabled={pending}>{pending && <Loader2 className="animate-spin" />}{t.invite.accept}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
