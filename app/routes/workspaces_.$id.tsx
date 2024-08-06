import { useState } from "react";
import { LoaderFunctionArgs } from "@remix-run/node";
import {
  json,
  redirect,
  useLoaderData,
  useNavigate,
  Link,
  Outlet,
  NavLink,
  useOutlet,
  useOutletContext,
} from "@remix-run/react";
import { FaPlus, FaChevronDown, FaChevronUp } from "react-icons/fa";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { Button } from "~/components/ui/button";
import {
  forceTokenRefresh,
  getUserRole,
  getWorkspaceCampaigns,
  getWorkspaceInfo,
  updateUserWorkspaceAccessDate,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Card, CardHeader } from "~/components/ui/card";
import { MemberRole } from "~/components/Workspace/TeamMember";
import CampaignEmptyState from "~/components/CampaignEmptyState";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession) {
    return redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  const { data: workspace, error } = await getWorkspaceInfo({
    supabaseClient,
    workspaceId,
  });
  if (error) {
    console.log(error);
    if (error.code === "PGRST116") {
      return redirect("/workspaces", { headers });
    }
  }

  updateUserWorkspaceAccessDate({ workspaceId, supabaseClient });
  const userRole = getUserRole({ serverSession, workspaceId });
  if (userRole == null) {
    const { data: refreshData, error: refreshError } = await forceTokenRefresh({
      serverSession,
      supabaseClient,
    });
  }

  try {
    const { data: audiences, error: audiencesError } = await supabaseClient
      .from("audience")
      .select()
      .eq("workspace", workspaceId);
    if (audiencesError) throw { audiencesError };
    const { data: campaigns, error: campaignsError } =
      await getWorkspaceCampaigns({
        supabaseClient,
        workspaceId,
      });
    if (campaignsError) throw { campaignsError };
    return json({ workspace, audiences, campaigns, userRole }, { headers });
  } catch (error) {
    console.log(error);
    return json({ userRole, error }, 500);
  }
};

export default function Workspace() {
  const { workspace, audiences, campaigns, userRole } = useLoaderData();
  const [campaignsListOpen, setCampaignsListOpen] = useState(false);
  const outlet = useOutlet();
  const context = useOutletContext();
  const handleNavlinkStyles = ({ isActive, isPending }) =>
    `flex bg-gray-100 items-center px-4 py-2 text-sm font-medium transition-colors font-Zilla-Slab ${
      isActive
        ? "border-primary border-2 text-primary-accent bg-white dark:bg-slate-700"
        : isPending
          ? "bg-muted"
          : "hover:bg-muted"
    }`;

  const CampaignsList = () => (
    <Card className="flex flex-auto flex-col border-none bg-secondary">
      <CardHeader className="p-0">
        <Link
          to={`campaigns/new`}
          className="flex items-center justify-center gap-2 rounded-none bg-primary p-2 text-primary-foreground md:rounded-t-lg"
        >
          <span>Add Campaign</span>
          <FaPlus size="16" />
        </Link>
      </CardHeader>
      <div className="flex flex-grow flex-col justify-between">
        <nav className="flex flex-col">
          {campaigns?.map((row, i) => {
            const draftNotAllowed =
              (userRole === MemberRole.Caller ||
                userRole === MemberRole.Member) &&
              row.status === "draft";
            return (
              row.status !== "complete" &&
              !draftNotAllowed && (
                <NavLink
                  to={`campaigns/${row.id}`}
                  key={row.id}
                  className={handleNavlinkStyles}
                  onClick={() => setCampaignsListOpen(false)}
                >
                  {row.title || `Unnamed campaign ${i + 1}`}
                </NavLink>
              )
            );
          })}
        </nav>
        <nav className="">
          <NavLink
            className={`flex items-center justify-center rounded-b-md bg-gray-100 px-4 py-2 font-Zilla-Slab text-sm font-medium transition-colors hover:bg-white`}
            to={"#"}
          >
            {" "}
            {/* Todo: build "campaigns/archive" to display completed campaigns */}
            Archived Campaigns (
            {campaigns.filter((i) => i.status === "complete").length})
          </NavLink>
        </nav>
      </div>
    </Card>
  );

  return (
    <main className="container mx-auto flex min-h-[80vh] flex-col py-10">
      <WorkspaceNav
        workspace={workspace}
        isInChildRoute={false}
        userRole={userRole}
      />
      <div className="flex flex-grow flex-col gap-8 sm:flex-row">
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
            <CampaignsList />
          </div>
        </div>
        <div className="flex flex-auto flex-col contain-content overflow-x-auto">
          {!outlet ? (
            <CampaignEmptyState
              hasAccess={userRole === "admin" || userRole === "owner"}
            />
          ) : (
            <Outlet context={{ audiences, campaigns, ...context }} />
          )}
        </div>
      </div>
    </main>
  );
}
