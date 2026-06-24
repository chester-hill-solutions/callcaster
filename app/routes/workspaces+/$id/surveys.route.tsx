export { loader } from "./surveys.loader.server";

import { Link, Outlet, useLoaderData, useOutlet, useOutletContext } from "react-router";

import { Survey } from "@/lib/types";
import type { ContextType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heading, Text } from "@/components/ui/typography";
import { Plus, Calendar, Users, CheckCircle, XCircle } from "lucide-react";

export default function SurveysPage() {
  const outlet = useOutlet();
  const parentContext = useOutletContext<ContextType>();
  const { surveys, workspaceId } = useLoaderData();

  if (outlet) {
    return <Outlet context={parentContext} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Heading as="h1" level={2} branded={false}>
            Surveys
          </Heading>
          <Text variant="muted">
            Create and manage surveys for your workspace
          </Text>
        </div>
        <Button asChild>
          <Link to={`/workspaces/${workspaceId}/surveys/new`}>
            <Plus className="w-4 h-4 mr-2" />
            New Survey
          </Link>
        </Button>
      </div>

      {surveys.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Users className="mb-4 h-12 w-12 text-muted-foreground" />
          <Heading level={4} branded={false} className="mb-2">
            No surveys yet
          </Heading>
          <Text variant="muted" className="mb-4 max-w-sm">
            Create your first survey to start collecting responses
          </Text>
          <Button asChild>
            <Link to={`/workspaces/${workspaceId}/surveys/new`}>
              <Plus className="w-4 h-4 mr-2" />
              Create Survey
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {surveys.map((survey: Survey & { survey_response: { count: number }[] }) => (
            <li
              key={survey.id}
              className="flex flex-col gap-4 py-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{survey.title}</p>
                  <Badge variant={survey.is_active ? "default" : "secondary"}>
                    {survey.is_active ? (
                      <CheckCircle className="mr-1 h-3 w-3" />
                    ) : (
                      <XCircle className="mr-1 h-3 w-3" />
                    )}
                    {survey.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <Text variant="small" className="text-muted-foreground">
                  ID: {survey.survey_id}
                </Text>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center">
                    <Calendar className="mr-1 h-4 w-4" />
                    Created {new Date(survey.created_at).toLocaleDateString()}
                  </span>
                  <span className="inline-flex items-center">
                    <Users className="mr-1 h-4 w-4" />
                    {survey.survey_response[0]?.count || 0} responses
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/workspaces/${workspaceId}/surveys/${survey.survey_id}`}>
                    View
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/workspaces/${workspaceId}/surveys/${survey.survey_id}/edit`}>
                    Edit
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
