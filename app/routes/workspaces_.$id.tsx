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
import { CardContent } from "~/components/CustomCard";

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

  const handleNavlinkStyles = ({ isActive, isPending }) =>
    `flex items-center px-4 py-2 text-sm font-medium transition-colors font-Zilla-Slab ${
      isActive
        ? "border-primary border-2 text-primary-accent bg-white dark:bg-slate-700"
        : isPending
        ? "bg-muted"
        : "hover:bg-muted"
    }`;

  const CampaignsList = () => (
    <Card className="h-full border-none">
      <CardHeader className="p-0">
        <Link
          to={`campaigns/new`}
          className="flex items-center justify-center gap-2 bg-primary p-2 text-primary-foreground rounded-t-lg"
        >
          <span>Add Campaign</span>
          <FaPlus size="16" />
        </Link>
      </CardHeader>
      <CardContent>
        <nav className="flex flex-col space-y-">
          {campaigns?.map((row, i) => (
            <NavLink
              to={`campaigns/${row.id}`}
              key={row.id}
              className={handleNavlinkStyles}
              onClick={() => setCampaignsListOpen(false)}
            >
              {row.title || `Unnamed campaign ${i + 1}`}
            </NavLink>
          ))}
        </nav>
      </CardContent>
    </Card>
  );

  return (
    <main className="container mx-auto py-8">
      <WorkspaceNav
        workspace={workspace}
        isInChildRoute={false}
        userRole={userRole}
      />
      <div className="mt-8 grid gap-8 md:grid-cols-[250px_1fr]">
        <div className="bg-secondary dark:bg-slate-900 rounded-lg border-2 border-gray-300">
          <Button
            variant="outline"
            className="flex w-full items-center justify-between md:hidden"
            onClick={() => setCampaignsListOpen(!campaignsListOpen)}
          >
            <span>Campaigns</span>
            {campaignsListOpen ? <FaChevronUp /> : <FaChevronDown />}
          </Button>
          <div className={`md:block ${campaignsListOpen ? "block" : "hidden"}`}>
            <CampaignsList />
          </div>
        </div>
        <Card className="min-h-[600px]">
          <CardContent>
            <Outlet context={{ audiences, campaigns }} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
