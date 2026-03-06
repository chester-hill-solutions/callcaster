import { Context, Suspense, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { defer, LoaderFunctionArgs } from "@remix-run/node";
import {
  Await,
  json,
  redirect,
  useLoaderData,
  Outlet,
  useOutlet,
  useOutletContext,
} from "@remix-run/react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { MemberRole } from "@/components/workspace/TeamMember";
import { Button } from "@/components/ui/button";
import {
  getUserRole,
  getWorkspaceInfoWithDetails,
  type WorkspaceInfoWithDetails,
} from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { useRealtimeData } from "@/hooks/realtime/useRealtimeData";
import CampaignEmptyState from "@/components/campaign/CampaignEmptyState";
import CampaignsList from "@/components/campaign/CampaignList";
import { Campaign, ContextType, User } from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    throw new Error("No workspace found");
  }

  const userRole = (await getUserRole({ supabaseClient: supabaseClient as SupabaseClient, user: user as unknown as User, workspaceId: workspaceId as string }))?.role;
  try {
    const workspacePromise = getWorkspaceInfoWithDetails({
      supabaseClient,
      workspaceId,
      userId: user.id
    });

    return defer({
      userRole: userRole,
      workspaceData: workspacePromise,
      headers
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "PGRST116") {
      throw redirect("/workspaces", { headers });
    }
    throw error;
  }
};

function WorkspaceResolvedView({
  resolvedData,
  userRole,
  outlet,
  campaignsListOpen,
  setCampaignsListOpen,
  context,
}: {
  resolvedData: WorkspaceInfoWithDetails;
  userRole: string | null | undefined;
  outlet: ReturnType<typeof useOutlet>;
  campaignsListOpen: boolean;
  setCampaignsListOpen: Dispatch<SetStateAction<boolean>>;
  context: ContextType;
}) {
  const normalizedWorkspace = resolvedData.workspace as unknown as {
    id: string;
    name?: string | null;
    credits?: number | null;
  };
  const workspace = {
    id: String(normalizedWorkspace.id),
    name:
      typeof normalizedWorkspace.name === "string"
        ? normalizedWorkspace.name
        : "",
    credits:
      typeof normalizedWorkspace.credits === "number"
        ? normalizedWorkspace.credits
        : 0,
  };
  const audiences = (resolvedData.audiences ?? []) as Array<{ id: string | number }>;
  const campaigns = (resolvedData.campaigns ?? []) as Array<{ id: string | number }>;
  const phoneNumbers = ((resolvedData.phoneNumbers ?? []) as Array<{ id: string | number } | null>).filter(Boolean);
  const { data: workspaceData } = useRealtimeData(
    context.supabase,
    workspace.id,
    "workspace",
    workspace ? [workspace] : [],
  );
  const { data: campaignsData } = useRealtimeData(
    context.supabase,
    workspace.id,
    "campaign",
    campaigns,
  );
  const { data: phoneNumbersData } = useRealtimeData(
    context.supabase,
    workspace.id,
    "workspace_numbers",
    phoneNumbers,
  );
  const { data: audiencesData } = useRealtimeData(
    context.supabase,
    workspace.id,
    "audience",
    audiences,
  );

  return (
    <>
      <WorkspaceNav
        workspace={workspaceData?.[0] ?? {
          id: workspace.id,
          name: workspace.name,
          credits: workspace.credits,
        }}
        userRole={(userRole as MemberRole | null | undefined) ?? MemberRole.Member}
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
              campaigns={campaignsData?.flat().filter(Boolean) as Campaign[] || []}
              userRole={(userRole as MemberRole | null | undefined) ?? MemberRole.Member}
              setCampaignsListOpen={setCampaignsListOpen}
            />
          </div>
        </div>
        <div className="flex flex-auto flex-col contain-content">
          {!outlet ? (
            <CampaignEmptyState
              hasAccess={Boolean(userRole === "admin" || userRole === "owner")}
              type={(phoneNumbersData?.length ?? 0) > 0 ? "campaign" : "number"}
            />
          ) : (
            <Outlet
              context={{
                workspace: workspaceData?.[0],
                audiences: audiencesData,
                campaigns: campaignsData,
                phoneNumbers: phoneNumbersData,
                userRole,
                ...context,
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default function Workspace() {
  const { workspaceData, userRole } = useLoaderData<typeof loader>();
  const [campaignsListOpen, setCampaignsListOpen] = useState(false);
  const outlet = useOutlet();
  const context = useOutletContext<ContextType>();

  return (
    <main className="container mx-auto flex min-h-[80vh] flex-col pt-10 pb-20">
      <Suspense fallback={<div>Loading workspace...</div>}>
        <Await resolve={workspaceData} errorElement={<div>Error loading workspace</div>}>
          {(resolvedData) => {
            return (
              <WorkspaceResolvedView
                resolvedData={resolvedData as unknown as WorkspaceInfoWithDetails}
                userRole={userRole}
                outlet={outlet}
                campaignsListOpen={campaignsListOpen}
                setCampaignsListOpen={setCampaignsListOpen}
                context={context}
              />
            );
          }}
        </Await>
      </Suspense>
    </main>
  );
}

export { ErrorBoundary };
