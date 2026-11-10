import { Sidebar } from "@/components/dashboard/sidebar";
import { requireWorkspace } from "@/lib/workspace";
import { can } from "@talestudio/core";
import { PRIVATE } from "@/lib/seo";

export const metadata = PRIVATE;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ws = await requireWorkspace();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <div className="md:sticky md:top-0 md:h-dvh">
        <Sidebar
          user={{ name: ws.user.name, email: ws.user.email }}
          workspace={{ id: ws.org.id, name: ws.org.name, personal: ws.org.personal, plan: ws.org.plan, credits: ws.org.credits, role: ws.role, canCreate: can(ws.role, "project:create") }}
          memberships={ws.memberships.map(({ id, name, personal }) => ({ id, name, personal }))}
        />
      </div>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
