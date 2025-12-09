import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate } from "@remix-run/react";
import { useState, useEffect } from "react";
import { verifyAuth } from "~/lib/supabase.server";
import { getUserRole } from "~/lib/database.server";
import { User, SurveyFormData, SurveyQuestionType, SurveyPage, SurveyQuestion, QuestionOption, SurveyPageFormData, SurveyQuestionFormData, QuestionOptionFormData } from "~/lib/types";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
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

  if (!userRole || !["owner", "admin", "member"].includes(userRole.role)) {
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
      )
    `)
    .eq("survey_id", surveyId)
    .eq("workspace", workspaceId)
    .single();

  if (surveyError || !survey) {
    throw new Response("Survey not found", { status: 404 });
  }

  // Transform the data to match the form structure
  const formData: SurveyFormData = {
    survey_id: survey.survey_id,
    title: survey.title,
    is_active: survey.is_active,
    pages: survey.survey_page?.map((page: SurveyPage & { survey_question?: Array<SurveyQuestion & { question_option?: QuestionOption[] }> }) => ({
      page_id: page.page_id,
      title: page.title,
      page_order: page.page_order,
      questions: page.survey_question?.map((question) => ({
        question_id: question.question_id,
        question_text: question.question_text,
        question_type: question.question_type as SurveyQuestionType,
        is_required: question.is_required,
        question_order: question.question_order,
        options: question.question_option?.map((option) => ({
          option_value: option.option_value,
          option_label: option.option_label,
          option_order: option.option_order,
        })) || []
      })) || []
    })) || []
  };

  return json({
    survey,
    formData,
    workspaceId,
    user,
    userRole,
  });
}

export default function EditSurveyPage() {
  const { survey, formData: initialFormData, workspaceId } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState<SurveyFormData>(initialFormData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formDataToSubmit = new FormData();
    formDataToSubmit.append("surveyData", JSON.stringify(formData));
    formDataToSubmit.append("surveyId", survey.survey_id);

    submit(formDataToSubmit, {
      method: "PATCH",
      action: "/api/surveys",
    });
  };

  const addPage = () => {
    const newPageId = `page-${formData.pages.length + 1}`;
    setFormData(prev => ({
      ...prev,
      pages: [
        ...prev.pages,
        {
          page_id: newPageId,
          title: `Page ${prev.pages.length + 1}`,
          page_order: prev.pages.length + 1,
          questions: []
        }
      ]
    }));
  };

  const removePage = (pageIndex: number) => {
    if (formData.pages.length <= 1) return;
    
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.filter((_, index) => index !== pageIndex)
    }));
  };

  const addQuestion = (pageIndex: number) => {
    const page = formData.pages[pageIndex];
    const newQuestionId = `question-${page.questions.length + 1}`;
    
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.map((p, index) => 
        index === pageIndex 
          ? {
              ...p,
              questions: [
                ...p.questions,
                {
                  question_id: newQuestionId,
                  question_text: "",
                  question_type: "text" as SurveyQuestionType,
                  is_required: false,
                  question_order: p.questions.length + 1,
                  options: []
                }
              ]
            }
          : p
      )
    }));
  };

  const removeQuestion = (pageIndex: number, questionIndex: number) => {
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.map((p, index) => 
        index === pageIndex 
          ? {
              ...p,
              questions: p.questions.filter((_, qIndex) => qIndex !== questionIndex)
            }
          : p
      )
    }));
  };

  const addOption = (pageIndex: number, questionIndex: number) => {
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.map((p, pIndex) => 
        pIndex === pageIndex 
          ? {
              ...p,
              questions: p.questions.map((q, qIndex) => 
                qIndex === questionIndex 
                  ? {
                      ...q,
                      options: [
                        ...(q.options || []),
                        {
                          option_value: "",
                          option_label: "",
                          option_order: (q.options?.length || 0) + 1
                        }
                      ]
                    }
                  : q
              )
            }
          : p
      )
    }));
  };

  const removeOption = (pageIndex: number, questionIndex: number, optionIndex: number) => {
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.map((p, pIndex) => 
        pIndex === pageIndex 
          ? {
              ...p,
              questions: p.questions.map((q, qIndex) => 
                qIndex === questionIndex 
                  ? {
                      ...q,
                      options: q.options?.filter((_, oIndex) => oIndex !== optionIndex) || []
                    }
                  : q
              )
            }
          : p
      )
    }));
  };

  const updateField = (field: keyof SurveyFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updatePageField = (pageIndex: number, field: keyof SurveyPageFormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.map((p, index) => 
        index === pageIndex ? { ...p, [field]: value } : p
      )
    }));
  };

  const updateQuestionField = (pageIndex: number, questionIndex: number, field: keyof SurveyQuestionFormData, value: string | boolean | SurveyQuestionType) => {
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.map((p, pIndex) => 
        pIndex === pageIndex 
          ? {
              ...p,
              questions: p.questions.map((q, qIndex) => 
                qIndex === questionIndex ? { ...q, [field]: value } : q
              )
            }
          : p
      )
    }));
  };

  const updateOptionField = (pageIndex: number, questionIndex: number, optionIndex: number, field: keyof QuestionOptionFormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.map((p, pIndex) => 
        pIndex === pageIndex 
          ? {
              ...p,
              questions: p.questions.map((q, qIndex) => 
                qIndex === questionIndex 
                  ? {
                      ...q,
                      options: q.options?.map((o, oIndex) => 
                        oIndex === optionIndex ? { ...o, [field]: value } : o
                      ) || []
                    }
                  : q
              )
            }
          : p
      )
    }));
  };

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="outline" asChild>
            <Link to={`/workspaces/${workspaceId}/surveys/${survey.survey_id}`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Survey
            </Link>
          </Button>
        </div>
        <h1 className="text-3xl font-bold">Edit Survey</h1>
        <p className="text-muted-foreground">
          Update your survey structure and questions
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Survey Details</CardTitle>
            <CardDescription>
              Basic information about your survey
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="survey_id">Survey ID</Label>
              <Input
                id="survey_id"
                value={formData.survey_id}
                onChange={(e) => updateField("survey_id", e.target.value)}
                placeholder="e.g., ontario-political-2025"
                required
                disabled
              />
              <p className="text-sm text-muted-foreground mt-1">
                Survey ID cannot be changed after creation
              </p>
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="Survey title"
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => updateField("is_active", checked)}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </CardContent>
        </Card>

        {formData.pages.map((page, pageIndex) => (
          <Card key={page.page_id} className="mb-6">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div className="flex-1">
                  <Input
                    value={page.title}
                    onChange={(e) => updatePageField(pageIndex, "title", e.target.value)}
                    placeholder="Page title"
                    className="text-lg font-semibold"
                  />
                </div>
                {formData.pages.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removePage(pageIndex)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {page.questions.map((question, questionIndex) => (
                <Card key={question.question_id} className="p-4 border">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 space-y-4">
                        <div>
                          <Label>Question Text</Label>
                          <Textarea
                            value={question.question_text}
                            onChange={(e) => updateQuestionField(pageIndex, questionIndex, "question_text", e.target.value)}
                            placeholder="Enter your question"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Question Type</Label>
                            <Select
                              value={question.question_type}
                              onValueChange={(value) => updateQuestionField(pageIndex, questionIndex, "question_type", value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="textarea">Text Area</SelectItem>
                                <SelectItem value="radio">Radio</SelectItem>
                                <SelectItem value="checkbox">Checkbox</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={question.is_required}
                              onCheckedChange={(checked) => updateQuestionField(pageIndex, questionIndex, "is_required", checked)}
                            />
                            <Label>Required</Label>
                          </div>
                        </div>
                        
                        {(question.question_type === "radio" || question.question_type === "checkbox") && (
                          <div>
                            <Label>Options</Label>
                            <div className="space-y-2">
                              {question.options?.map((option, optionIndex) => (
                                <div key={optionIndex} className="flex gap-2">
                                  <Input
                                    value={option.option_value}
                                    onChange={(e) => updateOptionField(pageIndex, questionIndex, optionIndex, "option_value", e.target.value)}
                                    placeholder="Value"
                                    className="flex-1"
                                  />
                                  <Input
                                    value={option.option_label}
                                    onChange={(e) => updateOptionField(pageIndex, questionIndex, optionIndex, "option_label", e.target.value)}
                                    placeholder="Label"
                                    className="flex-1"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => removeOption(pageIndex, questionIndex, optionIndex)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addOption(pageIndex, questionIndex)}
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Option
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeQuestion(pageIndex, questionIndex)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => addQuestion(pageIndex)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Question
              </Button>
            </CardContent>
          </Card>
        ))}

        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={addPage}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Page
          </Button>
          <Button type="submit">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
} 