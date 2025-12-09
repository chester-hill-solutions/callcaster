import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole } from "@/lib/database.server";
import { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Download,
  Eye,
  Clock,
} from "lucide-react";
import { Link } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/lib/database.types";
import type { SurveyQuestion, ResponseAnswer, Contact } from "@/lib/types";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);
  const { id: workspaceId, surveyId } = params;

  if (!workspaceId || !surveyId) {
    throw new Response("Workspace ID and Survey ID are required", {
      status: 400,
    });
  }

  // Get user role for this workspace
  const userRole = await getUserRole({
    supabaseClient,
    user: user as unknown as User,
    workspaceId,
  });

  if (!userRole) {
    throw new Response("Unauthorized", { status: 403 });
  }

  // Get survey with questions
  const { data: survey, error: surveyError } = await supabaseClient
    .from("survey")
    .select(
      `
      *,
      survey_page(
        survey_question(
          id,
          question_id,
          question_text,
          question_type
        )
      )
    `,
    )
    .eq("survey_id", surveyId)
    .eq("workspace", workspaceId)
    .single();

  if (surveyError || !survey) {
    throw new Response("Survey not found", { status: 404 });
  }

  // Get all responses with contact info
  const { data: responses, error: responsesError } = await supabaseClient
    .from("survey_response")
    .select(
      `
      *,
      contact(firstname, surname, phone, email),
      response_answer(
        *,
        survey_question(
          question_id,
          question_text,
          question_type,
          question_option(option_label)
        )
      )
    `,
    )
    .eq("survey_id", survey.id)
    .order("created_at", { ascending: false });

  if (responsesError) {
    console.error("Error fetching responses:", responsesError);
  }

  // Get response statistics
  const totalResponses = responses?.length || 0;
  const completedResponses =
    responses?.filter((r) => r.completed_at)?.length || 0;
  const inProgressResponses = totalResponses - completedResponses;

  return json({
    survey,
    responses: responses || [],
    workspaceId,
    user,
    userRole,
    stats: {
      total: totalResponses,
      completed: completedResponses,
      inProgress: inProgressResponses,
      completionRate:
        totalResponses > 0 ? (completedResponses / totalResponses) * 100 : 0,
    },
  });
}



type SurveyPageWithQuestions = {
  survey_question?: Array<{
    id: number;
    question_id: string;
    question_text: string;
    question_type: string;
  }>;
};

type SurveyWithPages = Tables<"survey"> & {
  survey_page?: SurveyPageWithQuestions[];
};

type ResponseAnswerWithQuestion = ResponseAnswer & {
  survey_question?: {
    question_id: string;
    question_text: string;
    question_type: string;
    question_option?: Array<{ option_label: string }>;
  };
};

type SurveyResponseWithContact = Tables<"survey_response"> & {
  contact?: Pick<Contact, "firstname" | "surname" | "phone" | "email"> | null;
  response_answer?: ResponseAnswerWithQuestion[];
};

export default function SurveyResponsesPage() {
  const { survey, responses, workspaceId, stats } =
    useLoaderData<typeof loader>();
  const [selectedResponse, setSelectedResponse] = useState<SurveyResponseWithContact | null>(null);
  const exportFetcher = useFetcher();

  useEffect(() => {
    if (exportFetcher.data && typeof exportFetcher.data === "string") {
      // Create a blob from the CSV data and trigger download
      const blob = new Blob([exportFetcher.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `survey-responses-${survey.title}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  }, [exportFetcher.data, survey.title]);

  const allQuestions =
    (survey as SurveyWithPages).survey_page?.flatMap((page) => page.survey_question || []) ||
    [];

  const formatAnswer = (answer: ResponseAnswerWithQuestion) => {
    if (!answer) return "-";

    if (answer.survey_question?.question_type === "checkbox") {
      try {
        const values = JSON.parse(answer.answer_value);
        return Array.isArray(values) ? values.join(", ") : answer.answer_value;
      } catch {
        return answer.answer_value;
      }
    }
    return answer.answer_value;
  };

  const getContactName = (response: SurveyResponseWithContact) => {
    if (response.contact?.firstname && response.contact?.surname) {
      return `${response.contact.firstname} ${response.contact.surname}`;
    }
    if (response.contact?.phone) {
      return response.contact.phone;
    }
    if (response.contact?.email) {
      return response.contact.email;
    }
    return "Anonymous";
  };

  const getAnswerForQuestion = (response: SurveyResponseWithContact, questionId: string) => {
    const question = allQuestions.find(
      (q) => q.question_id === questionId,
    );
    if (!question) return "-";

    // Find the answer by the database question ID
    const answer = response.response_answer?.find(
      (a) => a.question_id === question.id,
    );
    return answer ? formatAnswer(answer) : "-";
  };

  // Card width classes for consistency
  // You can adjust max-w-4xl as needed for your design
  const cardWidthClass = "w-full  max-w-full sm:max-w-[67vw]";

  return (
    <main className="py-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-4 flex items-center gap-4">
            <Button variant="outline" asChild>
              <Link
                to={`/workspaces/${workspaceId}/surveys/${survey.survey_id}`}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Survey
              </Link>
            </Button>
          </div>
          <h1 className="text-3xl font-bold">Survey Responses</h1>
          <p className="text-muted-foreground">
            {survey.title} - Response Analysis
          </p>
        </div>
        <Button 
          variant="outline"
          onClick={() => {
            exportFetcher.load(`./export`);
          }}
          disabled={exportFetcher.state === "loading"}
        >
          <Download className="mr-2 h-4 w-4" />
          {exportFetcher.state === "loading" ? "Exporting..." : "Export Data"}
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="mb-6 grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Responses
                </p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Completed
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.completed}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  In Progress
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  {stats.inProgress}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Completion Rate
                </p>
                <p className="text-2xl font-bold">
                  {stats.completionRate.toFixed(1)}%
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                <span className="text-sm font-bold text-blue-600">%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">Response List</TabsTrigger>
          <TabsTrigger value="chart">Chart View</TabsTrigger>
          <TabsTrigger value="details">Response Details</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className={cardWidthClass}>
            <Card>
              <CardHeader>
                <CardTitle>All Responses</CardTitle>
                <CardDescription>
                  {responses.length} total responses
                </CardDescription>
              </CardHeader>
              <CardContent>
                {responses.length === 0 ? (
                  <p className="text-muted-foreground">No responses yet</p>
                ) : (
                  <div className="space-y-4">
                    {(responses as SurveyResponseWithContact[]).map((response) => (
                      <div
                        key={response.id}
                        className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="font-medium">
                                {getContactName(response)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(response.created_at).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Badge
                                variant={
                                  response.completed_at
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {response.completed_at
                                  ? "Completed"
                                  : "In Progress"}
                              </Badge>
                              {response.last_page_completed && (
                                <Badge variant="outline">
                                  Page: {response.last_page_completed}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedResponse(response)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="chart" className="space-y-4">
          <div className={cardWidthClass}>
            <Card>
              <CardHeader>
                <CardTitle>Response Chart</CardTitle>
                <CardDescription>All responses in table format</CardDescription>
              </CardHeader>
              <CardContent>
                {responses.length === 0 ? (
                  <p className="text-muted-foreground">No responses yet</p>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <table className="w-full table-fixed border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="w-32 border border-gray-300 px-4 py-2 text-left font-medium">
                            Respondent
                          </th>
                          <th className="w-32 border border-gray-300 px-4 py-2 text-left font-medium">
                            Status
                          </th>
                          <th className="w-24 border border-gray-300 px-4 py-2 text-left font-medium">
                            Started
                          </th>
                          {allQuestions.map((question) => (
                            <th
                              key={question.question_id}
                              className="w-48 border border-gray-300 px-4 py-2 text-left font-medium"
                            >
                              {question.question_text}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(responses as SurveyResponseWithContact[]).map((response, index) => {
                          return (
                            <tr
                              key={response.id}
                              className={
                                index % 2 === 0 ? "bg-white" : "bg-gray-50"
                              }
                            >
                              <td className="truncate border border-gray-300 px-4 py-2 font-medium">
                                {getContactName(response)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2">
                                <Badge
                                  variant={
                                    response.completed_at
                                      ? "default"
                                      : "secondary"
                                  }
                                  className="text-xs"
                                >
                                  {response.completed_at
                                    ? "Completed"
                                    : "In Progress"}
                                </Badge>
                              </td>
                              <td className="truncate border border-gray-300 px-4 py-2 text-sm">
                                {new Date(
                                  response.started_at,
                                ).toLocaleDateString()}
                              </td>
                              {allQuestions.map((question) => (
                                <td
                                  key={question.question_id}
                                  className="truncate border border-gray-300 px-4 py-2"
                                >
                                  {getAnswerForQuestion(
                                    response,
                                    question.question_id,
                                  )}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <div className={cardWidthClass}>
            {selectedResponse ? (
              <Card>
                <CardHeader>
                  <CardTitle>Response Details</CardTitle>
                  <CardDescription>
                    {getContactName(selectedResponse)} -{" "}
                    {new Date(selectedResponse.created_at).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">Status</Label>
                        <p>
                          <Badge
                            variant={
                              selectedResponse.completed_at
                                ? "default"
                                : "secondary"
                            }
                          >
                            {selectedResponse.completed_at
                              ? "Completed"
                              : "In Progress"}
                          </Badge>
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Started</Label>
                        <p>
                          {new Date(
                            selectedResponse.started_at,
                          ).toLocaleString()}
                        </p>
                      </div>
                      {selectedResponse.completed_at && (
                        <div>
                          <Label className="text-sm font-medium">
                            Completed
                          </Label>
                          <p>
                            {new Date(
                              selectedResponse.completed_at,
                            ).toLocaleString()}
                          </p>
                        </div>
                      )}
                      {selectedResponse.last_page_completed && (
                        <div>
                          <Label className="text-sm font-medium">
                            Last Page
                          </Label>
                          <p>{selectedResponse.last_page_completed}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-sm font-medium">Answers</Label>
                      <div className="mt-2 space-y-4">
                        {selectedResponse.response_answer?.map(
                          (answer) => (
                            <div
                              key={answer.id}
                              className="rounded-lg border p-4"
                            >
                              <h4 className="mb-2 font-medium">
                                {answer.survey_question?.question_text}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                Type: {answer.survey_question?.question_type}
                              </p>
                              <p className="mt-2">
                                <strong>Answer:</strong> {formatAnswer(answer)}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Eye className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">
                    No Response Selected
                  </h3>
                  <p className="text-muted-foreground">
                    Select a response from the list to view its details
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
