import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole } from "@/lib/database.server";
import { Survey, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Users, CheckCircle, XCircle } from "lucide-react";
import { Link } from "@remix-run/react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);
  const workspaceId = params.id;

  if (!workspaceId) {
    throw new Response("Workspace ID is required", { status: 400 });
  }

  // Get user role for this workspace
  const userRole = await getUserRole({ 
    supabaseClient, 
    user: user as unknown as User, 
    workspaceId 
  });

  // Get surveys for this workspace
  const { data: surveys, error } = await supabaseClient
    .from("survey")
    .select(`
      *,
      survey_response(count)
    `)
    .eq("workspace", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching surveys:", error);
    throw new Response("Failed to load surveys", { status: 500 });
  }

  return json({
    surveys: surveys || [],
    workspaceId,
    user,
    userRole,
  });
}

export default function SurveysPage() {
  const { surveys, workspaceId } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Surveys</h1>
          <p className="text-muted-foreground">
            Create and manage surveys for your workspace
          </p>
        </div>
        <Button asChild>
          <Link to={`/workspaces/${workspaceId}/surveys/new`}>
            <Plus className="w-4 h-4 mr-2" />
            New Survey
          </Link>
        </Button>
      </div>

      {surveys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No surveys yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first survey to start collecting responses
              </p>
              <Button asChild>
                <Link to={`/workspaces/${workspaceId}/surveys/new`}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Survey
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {surveys.map((survey: Survey & { survey_response: { count: number }[] }) => (
            <Card key={survey.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{survey.title}</CardTitle>
                    <CardDescription className="mt-1">
                      ID: {survey.survey_id}
                    </CardDescription>
                  </div>
                  <Badge variant={survey.is_active ? "default" : "secondary"}>
                    {survey.is_active ? (
                      <CheckCircle className="w-3 h-3 mr-1" />
                    ) : (
                      <XCircle className="w-3 h-3 mr-1" />
                    )}
                    {survey.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    Created {new Date(survey.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center">
                    <Users className="w-4 h-4 mr-1" />
                    {survey.survey_response[0]?.count || 0} responses
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild className="flex-1">
                    <Link to={`/workspaces/${workspaceId}/surveys/${survey.survey_id}`}>
                      View
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild className="flex-1">
                    <Link to={`/workspaces/${workspaceId}/surveys/${survey.survey_id}/edit`}>
                      Edit
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