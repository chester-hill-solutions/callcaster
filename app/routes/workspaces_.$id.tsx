import { Context, useState } from "react";
import { defer, LoaderFunctionArgs } from "@remix-run/node";
import {
  json,
  redirect,
  useLoaderData,
  Outlet,
  useOutlet,
  useOutletContext,
} from "@remix-run/react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { Button } from "~/components/ui/button";
import {
  forceTokenRefresh,
  getWorkspaceInfoWithDetails,
  updateUserWorkspaceAccessDate,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession, signOut } from "~/lib/supabase.server";
import { useWorkspaceContacts } from "~/hooks/useWorkspaceContacts";
import CampaignEmptyState from "~/components/CampaignEmptyState";
import CampaignsList from "~/components/CampaignList";
import { Audience, Campaign, ContextType, Flags, Workspace as WrkSpace, WorkspaceData, WorkspaceNumbers, Contact } from "~/lib/types";
import { MemberRole } from "~/components/Workspace/TeamMember";

type LoaderData = {
  workspace: WrkSpace & { workspace_users: { role: MemberRole }[] };
  audiences: Partial<Audience[]>;
  campaigns: Partial<Campaign[]>;
  userRole: MemberRole;
  phoneNumbers: Partial<WorkspaceNumbers[]>;
  flags: Flags;
  initialContacts: Contact[];
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession) {
    throw redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (!workspaceId) throw new Error("No workspace found");
  let workspace: Partial<WorkspaceData>;
  let workspace_users: Partial<{ role: MemberRole }[]>;
  let campaigns: Partial<Campaign[]>;
  let phoneNumbers: Partial<WorkspaceNumbers[]>;
  let audiences: Partial<Audience[]>;

  try {
    ({ workspace, campaigns, phoneNumbers, audiences, workspace_users } = await getWorkspaceInfoWithDetails({ supabaseClient, workspaceId, userId: serverSession.user.id }));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "PGRST116") {
      throw redirect("/workspaces", { headers });
    }
    throw error;
  }


  const userRole = workspace_users?.[0]?.role;
  await updateUserWorkspaceAccessDate({ workspaceId, supabaseClient });
  if (userRole == null) {
    const { error: refreshError } = await forceTokenRefresh({
      serverSession,
      supabaseClient,
    });
    if (refreshError) {
      await signOut(request);
      throw refreshError
    }
  }

  return {
    workspace,
    audiences,
    campaigns,
    userRole,
    phoneNumbers,
  };
};

export default function Workspace() {
  const { workspace, audiences, campaigns, userRole, phoneNumbers, } = useLoaderData<LoaderData>();
  const [campaignsListOpen, setCampaignsListOpen] = useState(false);
  const outlet = useOutlet();
  const context = useOutletContext<ContextType>();

  const contactDb = useWorkspaceContacts({
    supabase: context.supabase,
    workspace_id: workspace.id,
  });

  return (
    <main className="container mx-auto flex min-h-[80vh] flex-col py-10">
      <WorkspaceNav
        workspace={workspace}
        userRole={userRole}
      />
      <div className="flex flex-grow flex-col gap-4 sm:flex-row">
        <div className="relative w-full flex-shrink-0 rounded-lg border-2 border-gray-300 bg-secondary dark:bg-slate-900 sm:w-[250px]">
          <Button
            variant="outline"
            className="flex w-full items-center justify-between md:hidden"
            onClick={() => setCampaignsListOpen(!campaignsListOpen)}
          >
            <span>Campaigns</span>
            {campaignsListOpen ? <FaChevronUp /> : <FaChevronDown />}
          </Button>
          <div
            className={`${campaignsListOpen ? "block" : "hidden"} h-full md:flex`}
          >
            <CampaignsList
              campaigns={campaigns}
              userRole={userRole}
              setCampaignsListOpen={setCampaignsListOpen}
            />
          </div>
        </div>
        <div className="flex flex-auto flex-col contain-content overflow-hidden">
          {!outlet ? (
            <CampaignEmptyState
              hasAccess={Boolean(userRole === "admin" || userRole === "owner")}
              type={phoneNumbers?.length > 0 ? "campaign" : "number"}
            />
          ) : (
            <Outlet
              context={{
                audiences,
                campaigns,
                phoneNumbers,
                userRole,
                contactDb,
                ...context
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
