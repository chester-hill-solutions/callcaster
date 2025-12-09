import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole } from "@/lib/database.server";
import { User, SurveyWithPages } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Calendar, 
  Users, 
  CheckCircle, 
  XCircle, 
  Edit, 
  Trash2, 
  Copy,
  ExternalLink 
} from "lucide-react";
import { Link } from "@remix-run/react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);
  const { id: workspaceId, surveyId } = params;

  if (!workspaceId || !surveyId) {
    throw new Response("Workspace ID and Survey ID are required", { status: 400 });
  }

  // Get user role for this workspace
  const userRole = await getUserRole({ 
    supabaseClient, 
    user: user as unknown as User, 
    workspaceId 
  });

  if (!userRole) {
    throw new Response("Unauthorized", { status: 403 });
  }

  // Get survey with pages and questions
  const { data: survey, error: surveyError } = await supabaseClient
    .from("survey")
    .select(`
      *,
      survey_page(
        *,
        survey_question(
          *,
          question_option(*)
        )
      ),
      survey_response(count)
    `)
    .eq("survey_id", surveyId)
    .eq("workspace", workspaceId)
    .single();

  if (surveyError || !survey) {
    throw new Response("Survey not found", { status: 404 });
  }

  // Get recent responses
  const { data: recentResponses, error: responsesError } = await supabaseClient
    .from("survey_response")
    .select(`
      *,
      contact(firstname, surname, phone)
    `)
    .eq("survey_id", survey.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (responsesError) {
    console.error("Error fetching responses:", responsesError);
  }

  return json({
    survey,
    recentResponses: recentResponses || [],
    workspaceId,
    user,
    userRole,
  });
}

export default function SurveyDetailPage() {
  const { survey, recentResponses, workspaceId, userRole } = useLoaderData<typeof loader>();

  const surveyUrl = `${window.location.origin}/survey/${survey.survey_id}`;

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">{survey.title}</h1>
          <p className="text-muted-foreground">
            Survey ID: {survey.survey_id}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/workspaces/${workspaceId}/surveys/${survey.survey_id}/responses`}>
              <Users className="w-4 h-4 mr-2" />
              View Responses
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/workspaces/${workspaceId}/surveys/${survey.survey_id}/edit`}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={surveyUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              View Survey
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <Badge variant={survey.is_active ? "default" : "secondary"}>
                  {survey.is_active ? (
                    <CheckCircle className="w-3 h-3 mr-1" />
                  ) : (
                    <XCircle className="w-3 h-3 mr-1" />
                  )}
                  {survey.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Responses</p>
                <p className="text-2xl font-bold">
                  {survey.survey_response[0]?.count || 0}
                </p>
              </div>
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="text-sm">
                  {new Date(survey.created_at).toLocaleDateString()}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="structure" className="space-y-4">
        <TabsList>
          <TabsTrigger value="structure">Survey Structure</TabsTrigger>
          <TabsTrigger value="responses">Recent Responses</TabsTrigger>
        </TabsList>

        <TabsContent value="structure" className="space-y-4">
          {survey.survey_page?.map((page: any) => (
            <Card key={page.id}>
              <CardHeader>
                <CardTitle className="text-lg">{page.title}</CardTitle>
                <CardDescription>
                  Page {page.page_order} • {page.survey_question?.length || 0} questions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {page.survey_question?.map((question: any) => (
                  <div key={question.id} className="mb-4 p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium">{question.question_text}</h4>
                      <div className="flex gap-2">
                        <Badge variant="outline">{question.question_type}</Badge>
                        {question.is_required && (
                          <Badge variant="destructive">Required</Badge>
                        )}
                      </div>
                    </div>
                    {question.question_option && question.question_option.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground mb-1">Options:</p>
                        <ul className="list-disc list-inside text-sm">
                          {question.question_option.map((option: any) => (
                            <li key={option.id}>
                              {option.option_label} ({option.option_value})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="responses" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Responses</CardTitle>
              <CardDescription>
                Latest survey responses
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentResponses.length === 0 ? (
                <p className="text-muted-foreground">No responses yet</p>
              ) : (
                <div className="space-y-4">
                  {recentResponses.map((response: any) => (
                    <div key={response.id} className="flex justify-between items-center p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">
                          {response.contact?.firstname && response.contact?.surname
                            ? `${response.contact.firstname} ${response.contact.surname}`
                            : response.contact?.phone || "Anonymous"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(response.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={response.completed_at ? "default" : "secondary"}>
                          {response.completed_at ? "Completed" : "In Progress"}
                        </Badge>
                        {response.last_page_completed && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Page: {response.last_page_completed}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 