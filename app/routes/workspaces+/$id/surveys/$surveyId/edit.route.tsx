export { loader } from "./edit.loader.server";

import { Link, Navigate, useLoaderData, useFetcher } from "react-router";
import { ArrowLeft } from "lucide-react";

import type { SurveyFormData } from "@/lib/types";
import { surveySubmitError, surveySuccessPath } from "@/lib/survey-submit";
import type { SurveySubmitResult } from "@/lib/survey-submit";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { SurveyForm } from "@/components/surveys/SurveyForm";

export default function EditSurveyPage() {
  const {
    survey,
    formData: initialFormData,
    workspaceId,
  } = useLoaderData();
  const fetcher = useFetcher<SurveySubmitResult>();
  const successPath = surveySuccessPath(workspaceId, fetcher.data);

  const handleSubmit = (formData: SurveyFormData) => {
    const payload = new FormData();
    payload.append("surveyData", JSON.stringify(formData));
    payload.append("surveyId", survey.survey_id);

    fetcher.submit(payload, { method: "PATCH", action: "/api/surveys" });
  };

  return (
    <PageShell
      title="Edit Survey"
      description="Update your survey structure and questions"
      maxWidth="narrow"
      actions={
        <Button variant="outline" asChild>
          <Link to={`/workspaces/${workspaceId}/surveys/${survey.survey_id}`}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Survey
          </Link>
        </Button>
      }
    >
      {successPath && <Navigate to={successPath} />}
      <SurveyForm
        initialFormData={initialFormData}
        onSubmit={handleSubmit}
        submitLabel="Save Changes"
        submittingLabel="Saving..."
        isSubmitting={fetcher.state !== "idle"}
        error={surveySubmitError(fetcher.data)}
        surveyIdReadOnly
      />
    </PageShell>
  );
}