export { loader } from "./new.loader.server";

import { Navigate, useLoaderData, useFetcher } from "react-router";

import type { SurveyFormData } from "@/lib/types";
import { surveySubmitError, surveySuccessPath } from "@/lib/survey-submit";
import type { SurveySubmitResult } from "@/lib/survey-submit";
import { PageShell } from "@/components/ui/page-shell";
import { SurveyForm } from "@/components/surveys/SurveyForm";

const EMPTY_SURVEY: SurveyFormData = {
  survey_id: "",
  title: "",
  is_active: false,
  pages: [
    {
      page_id: "page-1",
      title: "Page 1",
      page_order: 1,
      questions: [],
    },
  ],
};

export default function NewSurveyPage() {
  const { workspaceId } = useLoaderData();
  const fetcher = useFetcher<SurveySubmitResult>();
  const successPath = surveySuccessPath(workspaceId, fetcher.data);

  const handleSubmit = (formData: SurveyFormData) => {
    const payload = new FormData();
    payload.append("surveyData", JSON.stringify(formData));
    payload.append("workspaceId", workspaceId);

    fetcher.submit(payload, { method: "POST", action: "/api/surveys" });
  };

  return (
    <PageShell
      title="Create New Survey"
      description="Build a new survey for your workspace"
      maxWidth="narrow"
    >
      {successPath && <Navigate to={successPath} />}
      <SurveyForm
        initialFormData={EMPTY_SURVEY}
        onSubmit={handleSubmit}
        submitLabel="Create Survey"
        submittingLabel="Creating..."
        isSubmitting={fetcher.state !== "idle"}
        error={surveySubmitError(fetcher.data)}
      />
    </PageShell>
  );
}