export { loader } from "./new.loader.server";

import { data as routeData, type LoaderFunctionArgs, useLoaderData, useFetcher, useNavigate } from "react-router";
import { useEffect, useState } from "react";

import { User , SurveyFormData, SurveyQuestionType, SurveyPageFormData, SurveyQuestionFormData, QuestionOptionFormData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Section, SectionHeader } from "@/components/shared/Section";
import { PageShell } from "@/components/ui/page-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save } from "lucide-react";

type CreateSurveyResult = { success: true; survey: { survey_id: string } } | { error: string };

export default function NewSurveyPage() {
  const { workspaceId } = useLoaderData();
  const fetcher = useFetcher<CreateSurveyResult>();
  const navigate = useNavigate();

  const [formData, setFormData] = useState<SurveyFormData>({
    survey_id: "",
    title: "",
    is_active: false,
    pages: [
      {
        page_id: "page-1",
        title: "Page 1",
        page_order: 1,
        questions: []
      }
    ]
  });

  // /api/surveys is a resource route (no component) — submitting via a plain
  // useSubmit() navigation lands the browser on that bare JSON response
  // (a blank page) instead of the survey the user just created. Submit
  // through a fetcher instead and redirect client-side once it succeeds.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "success" in fetcher.data && fetcher.data.success) {
      navigate(`/workspaces/${workspaceId}/surveys/${fetcher.data.survey.survey_id}`);
    }
  }, [fetcher.state, fetcher.data, navigate, workspaceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formDataToSubmit = new FormData();
    formDataToSubmit.append("surveyData", JSON.stringify(formData));
    formDataToSubmit.append("workspaceId", workspaceId);

    fetcher.submit(formDataToSubmit, {
      method: "POST",
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
    if (!page) return;
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
      pages: prev.pages.map((page, index) =>
        index === pageIndex ? { ...page, [field]: value } : page
      )
    }));
  };

  const updateQuestionField = (pageIndex: number, questionIndex: number, field: keyof SurveyQuestionFormData, value: string | boolean | SurveyQuestionType) => {
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.map((page, pIndex) =>
        pIndex === pageIndex
          ? {
              ...page,
              questions: page.questions.map((question, qIndex) =>
                qIndex === questionIndex ? { ...question, [field]: value } : question
              )
            }
          : page
      )
    }));
  };

  const updateOptionField = (pageIndex: number, questionIndex: number, optionIndex: number, field: keyof QuestionOptionFormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      pages: prev.pages.map((page, pIndex) =>
        pIndex === pageIndex
          ? {
              ...page,
              questions: page.questions.map((question, qIndex) =>
                qIndex === questionIndex
                  ? {
                      ...question,
                      options: question.options?.map((option, oIndex) =>
                        oIndex === optionIndex ? { ...option, [field]: value } : option
                      )
                    }
                  : question
              )
            }
          : page
      )
    }));
  };

  return (
    <PageShell
      title="Create New Survey"
      description="Build a new survey for your workspace"
      maxWidth="narrow"
    >
      <form onSubmit={handleSubmit}>
        <Section variant="flat" className="mb-6">
          <SectionHeader
            compact
            title="Survey Details"
            description="Basic information about your survey"
          />
          <div className="space-y-4">
            <div>
              <Label htmlFor="survey_id">Survey ID</Label>
              <Input
                id="survey_id"
                value={formData.survey_id}
                onChange={(e) => updateField("survey_id", e.target.value)}
                placeholder="e.g., ontario-political-2025"
                required
              />
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
          </div>
        </Section>

        {formData.pages.map((page, pageIndex) => (
          <Section key={page.page_id} variant="flat" className="mb-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex-1">
                <Input
                  value={page.title}
                  onChange={(e) => updatePageField(pageIndex, "title", e.target.value)}
                  placeholder="Page title"
                  className="text-lg font-semibold"
                  aria-label={`Page ${pageIndex + 1} title`}
                />
              </div>
              {formData.pages.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Remove page ${pageIndex + 1}`}
                  onClick={() => removePage(pageIndex)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="space-y-4">
              {page.questions.map((question, questionIndex) => (
                <div
                  key={question.question_id}
                  className="space-y-4 rounded-lg border border-border/70 bg-muted/20 p-4"
                >
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
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => addQuestion(pageIndex)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Question
              </Button>
            </div>
          </Section>
        ))}

        {fetcher.data && "error" in fetcher.data && fetcher.data.error && (
          <p role="alert" className="text-sm text-destructive mb-4">
            {fetcher.data.error}
          </p>
        )}

        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={addPage}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Page
          </Button>
          <Button type="submit" disabled={fetcher.state !== "idle"}>
            <Save className="w-4 h-4 mr-2" />
            {fetcher.state !== "idle" ? "Creating..." : "Create Survey"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
