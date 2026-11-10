import { PageHeader } from "@/components/dashboard/page-header";
import { NewWorkspaceForm, TeamPanel } from "@/components/dashboard/team-panel";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { listTeam } from "@/lib/team";
import { requireWorkspace } from "@/lib/workspace";
import { assignableRoles, can } from "@talestudio/core";

export async function generateMetadata() {
  return { title: (await getDictionary()).team.title };
}

export default async function TeamPage() {
  const [ws, t] = await Promise.all([requireWorkspace(), getDictionary()]);
  const team = await listTeam(ws.org.id);
  return (
    <>
      <PageHeader title={t.team.title} description={fmt(t.team.subtitle, { workspace: ws.org.name })} />
      <div className="grid max-w-4xl gap-8 px-8 py-8">
        <TeamPanel
          meId={ws.user.id}
          myRole={ws.role}
          personal={ws.org.personal}
          canManage={can(ws.role, "members:manage")}
          assignable={assignableRoles(ws.role)}
          members={team.members}
          invitations={can(ws.role, "members:manage") ? team.invitations : []}
        />
        <NewWorkspaceForm />
      </div>
    </>
  );
}
