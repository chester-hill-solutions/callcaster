export { loader } from "./$surveyId.loader.server";

import { Link, Outlet, useLoaderData, useOutlet, useOutletContext } from "react-router";

import type { ContextType } from "@/lib/types";
import { Section, SectionHeader } from "@/components/shared/Section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/ui/page-shell";
import { Text } from "@/components/ui/typography";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  Edit,
  ExternalLink,
} from "lucide-react";

interface SurveyPage {
  id: number;
  page_id: string;
  title: string;
  page_order: number;
  survey_question?: SurveyQuestion[];
}

interface SurveyQuestion {
  id: number;
  question_id: string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  question_order: number;
  question_option?: SurveyQuestionOption[];
}

interface SurveyQuestionOption {
  id: number;
  option_value: string;
  option_label: string;
  option_order: number;
}

interface SurveyResponse {
  id: number;
  created_at: string;
  completed_at?: string;
  last_page_completed?: number;
  contact?: {
    firstname?: string;
    surname?: string;
    phone?: string;
  };
}

interface Survey {
  survey_id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  survey_page?: SurveyPage[];
  survey_response?: Array<{ count: number }>;
}

type LoaderData = {
  survey: Survey;
  recentResponses: SurveyResponse[];
  workspaceId: string;
  userRole: unknown;
  /** Request origin, from the loader — see the note on `origin` there. */
  origin: string;
};

export default function SurveyDetailPage() {
  const outlet = useOutlet();
  const parentContext = useOutletContext<ContextType>();
  const { survey, recentResponses, workspaceId, origin } =
    useLoaderData<LoaderData>();

  if (outlet) {
    return <Outlet context={parentContext} />;
  }

  const surveyUrl = `${origin}/survey/${survey.survey_id}`;

  return (
    <PageShell
      title={survey.title}
      description={`Survey ID: ${survey.survey_id}`}
      maxWidth="content"
      actions={
        <>
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
        </>
      }
    >
      <div className="grid gap-6 border-b border-border/60 pb-6 md:grid-cols-3">
        <div>
          <Text variant="muted" className="text-sm font-medium">
            Status
          </Text>
          <div className="mt-2">
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
        <div>
          <Text variant="muted" className="text-sm font-medium">
            Responses
          </Text>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {survey.survey_response?.[0]?.count || 0}
          </p>
        </div>
        <div>
          <Text variant="muted" className="text-sm font-medium">
            Created
          </Text>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {new Date(survey.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <Tabs defaultValue="structure" className="space-y-4">
        <TabsList>
          <TabsTrigger value="structure">Survey Structure</TabsTrigger>
          <TabsTrigger value="responses">Recent Responses</TabsTrigger>
        </TabsList>

        <TabsContent value="structure" className="space-y-4">
          {survey.survey_page?.map((page: SurveyPage) => (
            <Section key={page.id} variant="flat">
              <SectionHeader
                compact
                branded={false}
                title={page.title}
                description={`Page ${page.page_order} • ${page.survey_question?.length || 0} questions`}
              />
              <div className="divide-y divide-border/60">
                {page.survey_question?.map((question: SurveyQuestion) => (
                  <div key={question.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="mb-2 flex items-start justify-between gap-4">
                      <h4 className="font-medium">{question.question_text}</h4>
                      <div className="flex shrink-0 gap-2">
                        <Badge variant="outline">{question.question_type}</Badge>
                        {question.is_required ? (
                          <Badge variant="destructive">Required</Badge>
                        ) : null}
                      </div>
                    </div>
                    {question.question_option && question.question_option.length > 0 ? (
                      <div className="mt-2">
                        <p className="mb-1 text-sm text-muted-foreground">Options:</p>
                        <ul className="list-inside list-disc text-sm">
                          {question.question_option.map((option: SurveyQuestionOption) => (
                            <li key={option.id}>
                              {option.option_label} ({option.option_value})
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Section>
          ))}
        </TabsContent>

        <TabsContent value="responses" className="space-y-4">
          <Section variant="flat">
            <SectionHeader
              compact
              branded={false}
              title="Recent Responses"
              description="Latest survey responses"
            />
            {recentResponses.length === 0 ? (
              <p className="text-muted-foreground">No responses yet</p>
            ) : (
              <div className="divide-y divide-border/60">
                {recentResponses.map((response: SurveyResponse) => (
                  <div
                    key={response.id}
                    className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
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
                      {response.last_page_completed ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Page: {response.last_page_completed}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
