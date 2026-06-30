import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { getSurveyDetailApi } from "@/lib/platform-data.server";
import {
  QuestionOption,
  SurveyFormData,
  SurveyPage,
  SurveyQuestion,
  SurveyQuestionType,
} from "@/lib/types";
import { verifyAuth } from "@/lib/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { user } = await verifyAuth(request);
  const { id: workspaceId, surveyId } = params;

  if (!workspaceId || !surveyId) {
    throw new Response("Missing required parameters", { status: 400 });
  }

  const userRole = await getUserRole({ user, workspaceId });

  const result = await getSurveyDetailApi(surveyId, workspaceId);
  if (!result.ok) {
    throw new Response(result.error, { status: result.status });
  }

  const survey = result.survey;

  const formData: SurveyFormData = {
    survey_id: survey.survey_id,
    title: survey.title,
    is_active: survey.is_active,
    pages:
      survey.survey_page?.map(
        (
          page: SurveyPage & {
            survey_question?: Array<
              SurveyQuestion & { question_option?: QuestionOption[] }
            >;
          },
        ) => ({
          page_id: page.page_id,
          title: page.title,
          page_order: page.page_order,
          questions:
            page.survey_question?.map((question) => ({
              question_id: question.question_id,
              question_text: question.question_text,
              question_type: question.question_type as SurveyQuestionType,
              is_required: question.is_required,
              question_order: question.question_order,
              options:
                question.question_option?.map((option) => ({
                  option_value: option.option_value,
                  option_label: option.option_label,
                  option_order: option.option_order,
                })) || [],
            })) || [],
        }),
      ) || [],
  };

  return routeData({
    survey,
    formData,
    workspaceId,
    user,
    userRole,
  });
}
