export { loader } from "./responses.loader.server";

import { data as routeData, type LoaderFunctionArgs, useLoaderData, useFetcher, Link } from "react-router";

import type { User, Survey, SurveyResponse, ResponseAnswer, Contact } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { Section, SectionHeader } from "@/components/shared/Section";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useState } from "react";
import { downloadBlobPart } from "@/lib/download-blob.client";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/lib/db-types";

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
    useLoaderData();
  const [selectedResponse, setSelectedResponse] = useState<SurveyResponseWithContact | null>(null);
  const exportFetcher = useFetcher();
  const handleExport = async () => {
    await exportFetcher.load("./export");
    if (typeof exportFetcher.data === "string") {
      downloadBlobPart({
        data: exportFetcher.data,
        filename: `survey-responses-${survey.title}-${new Date().toISOString().split("T")[0]}.csv`,
        mimeType: "text/csv",
      });
    }
  };

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
          <Heading as="h1" level={2} branded={false}>
            Survey Responses
          </Heading>
          <Text variant="muted">
            {survey.title} - Response Analysis
          </Text>
        </div>
        <Button 
          variant="outline"
          onClick={() => {
            void handleExport();
          }}
          disabled={exportFetcher.state === "loading"}
        >
          <Download className="mr-2 h-4 w-4" />
          {exportFetcher.state === "loading" ? "Exporting..." : "Export Data"}
        </Button>
      </div>

      {/* Statistics tiles */}
      <div className="mb-6 grid gap-6 md:grid-cols-4">
        <div className="rounded-lg border border-border/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <Text variant="small">
                  Total Responses
                </Text>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
        </div>

        <div className="rounded-lg border border-border/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <Text variant="small">
                  Completed
                </Text>
                <p className="text-2xl font-bold text-success">
                  {stats.completed}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
        </div>

        <div className="rounded-lg border border-border/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <Text variant="small">
                  In Progress
                </Text>
                <p className="text-2xl font-bold text-warning">
                  {stats.inProgress}
                </p>
              </div>
              <Clock className="h-8 w-8 text-warning" />
            </div>
        </div>

        <div className="rounded-lg border border-border/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <Text variant="small">
                  Completion Rate
                </Text>
                <p className="text-2xl font-bold">
                  {stats.completionRate.toFixed(1)}%
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <span className="text-sm font-bold text-primary">%</span>
              </div>
            </div>
        </div>
      </div>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">Response List</TabsTrigger>
          <TabsTrigger value="chart">Chart View</TabsTrigger>
          <TabsTrigger value="details">Response Details</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className={cardWidthClass}>
            <Section variant="flat">
              <SectionHeader
                title="All Responses"
                description={`${responses.length} total responses`}
              />
                {responses.length === 0 ? (
                  <Text variant="muted">No responses yet</Text>
                ) : (
                  <div className="space-y-4">
                    {(responses as SurveyResponseWithContact[]).map((response) => (
                      <div
                        key={response.id}
                        className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50"
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
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="chart" className="space-y-4">
          <div className={cardWidthClass}>
            <Section variant="flat">
              <SectionHeader
                title="Response Chart"
                description="All responses in table format"
              />
                {responses.length === 0 ? (
                  <Text variant="muted">No responses yet</Text>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <Table className="table-fixed border border-border">
                      <TableHeader>
                        <TableRow className="bg-muted">
                          <TableHead className="w-32 border border-border px-4 py-2">
                            Respondent
                          </TableHead>
                          <TableHead className="w-32 border border-border px-4 py-2">
                            Status
                          </TableHead>
                          <TableHead className="w-24 border border-border px-4 py-2">
                            Started
                          </TableHead>
                          {allQuestions.map((question) => (
                            <TableHead
                              key={question.question_id}
                              className="w-48 border border-border px-4 py-2"
                            >
                              {question.question_text}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(responses as SurveyResponseWithContact[]).map(
                          (response) => (
                            <TableRow key={response.id}>
                              <TableCell className="truncate border border-border px-4 py-2 font-medium">
                                {getContactName(response)}
                              </TableCell>
                              <TableCell className="border border-border px-4 py-2">
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
                              </TableCell>
                              <TableCell className="truncate border border-border px-4 py-2 text-sm">
                                {new Date(
                                  response.started_at,
                                ).toLocaleDateString()}
                              </TableCell>
                              {allQuestions.map((question) => (
                                <TableCell
                                  key={question.question_id}
                                  className="truncate border border-border px-4 py-2"
                                >
                                  {getAnswerForQuestion(
                                    response,
                                    question.question_id,
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ),
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <div className={cardWidthClass}>
            {selectedResponse ? (
              <Section variant="flat">
                <SectionHeader
                  title="Response Details"
                  description={`${getContactName(selectedResponse)} - ${new Date(selectedResponse.created_at).toLocaleString()}`}
                />
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
                              <Heading as="h4" level={4} branded={false} className="mb-2">
                                {answer.survey_question?.question_text}
                              </Heading>
                              <Text variant="muted">
                                Type: {answer.survey_question?.question_type}
                              </Text>
                              <p className="mt-2">
                                <strong>Answer:</strong> {formatAnswer(answer)}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
              </Section>
            ) : (
              <div className="rounded-lg border border-border/60 p-8 text-center">
                <Eye className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <Heading as="h3" level={4} branded={false} className="mb-2">
                  No Response Selected
                </Heading>
                <Text variant="muted">
                  Select a response from the list to view its details
                </Text>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
