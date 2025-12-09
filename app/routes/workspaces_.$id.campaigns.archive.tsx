import { json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { Campaign } from "~/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Link } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { ErrorBoundary } from "~/components/shared/ErrorBoundary";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, user, headers } = await verifyAuth(request);
  
  if (!user) {
    return redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    return redirect("/workspaces", { headers });
  }

  // Fetch archived campaigns
  const { data: archivedCampaigns, error } = await supabaseClient
    .from("campaign")
    .select("*")
    .eq("workspace", workspaceId)
    .eq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching archived campaigns:", error);
  }

  return json(
    { archivedCampaigns: archivedCampaigns || [] },
    { headers }
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const badgeStyles: Record<string, string> = {
    archived: "bg-gray-200 text-gray-800",
    complete: "bg-teal-100 text-teal-800",
  };

  return (
    <Badge className={`text-xxs mx-2 ${badgeStyles[status] || ""}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : "Archived"}
    </Badge>
  );
};

export default function ArchivedCampaigns() {
  const { archivedCampaigns } = useLoaderData<typeof loader>();
  const { workspace } = useOutletContext<{ workspace: { id: string } }>();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Archived Campaigns</h1>
          <p className="text-muted-foreground mt-2">
            View and manage your completed and archived campaigns
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to={`/workspaces/${workspace.id}/campaigns`}>
            Back to Campaigns
          </Link>
        </Button>
      </div>

      {archivedCampaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-lg">
              No archived campaigns found
            </p>
            <Button asChild className="mt-4">
              <Link to={`/workspaces/${workspace.id}/campaigns/new`}>
                Create Your First Campaign
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {archivedCampaigns.map((campaign: Campaign) => (
            <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg line-clamp-2">
                    {campaign.title || `Unnamed Campaign ${campaign.id}`}
                  </CardTitle>
                  <StatusBadge status={campaign.status || "archived"} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium">Type:</span>{" "}
                    {campaign.type || "N/A"}
                  </div>
                  {campaign.created_at && (
                    <div>
                      <span className="font-medium">Created:</span>{" "}
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </div>
                  )}
                  {campaign.end_date && (
                    <div>
                      <span className="font-medium">Ended:</span>{" "}
                      {new Date(campaign.end_date).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <Button asChild variant="outline" className="w-full">
                    <Link to={`/workspaces/${workspace.id}/campaigns/${campaign.id}`}>
                      View Details
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export { ErrorBoundary };

