import type { FormEvent } from "react";

import type {
  QuestionOptionFormData,
  SurveyFormData,
  SurveyPageFormData,
  SurveyQuestionFormData,
  SurveyQuestionType,
} from "@/lib/types";
import { useSurveyForm } from "@/hooks/surveys";
import { Button } from "@/components/ui/button";
import { Section, SectionHeader } from "@/components/shared/Section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save } from "lucide-react";

const QUESTION_TYPES: ReadonlyArray<{
  value: SurveyQuestionType;
  label: string;
}> = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text Area" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Checkbox" },
];

/** The Select hands back a plain string; keep the stored type honest. */
function isSurveyQuestionType(value: string): value is SurveyQuestionType {
  return QUESTION_TYPES.some((type) => type.value === value);
}

type SurveyFormHandlers = ReturnType<typeof useSurveyForm>;

function SurveyQuestionCard({
  question,
  pageIndex,
  questionIndex,
  handlers,
}: {
  question: SurveyQuestionFormData;
  pageIndex: number;
  questionIndex: number;
  handlers: SurveyFormHandlers;
}) {
  const {
    addOption,
    removeOption,
    removeQuestion,
    updateQuestionField,
    updateOptionField,
  } = handlers;

  const showOptions =
    question.question_type === "radio" || question.question_type === "checkbox";

  return (
    <div className="space-y-4 rounded-lg border border-border/70 bg-muted/20 p-4">
      <div className="flex justify-between items-start">
        <div className="flex-1 space-y-4">
          <div>
            <Label>Question Text</Label>
            <Textarea
              value={question.question_text}
              onChange={(e) =>
                updateQuestionField(
                  pageIndex,
                  questionIndex,
                  "question_text",
                  e.target.value,
                )
              }
              placeholder="Enter your question"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Question Type</Label>
              <Select
                value={question.question_type}
                onValueChange={(value) => {
                  if (isSurveyQuestionType(value)) {
                    updateQuestionField(
                      pageIndex,
                      questionIndex,
                      "question_type",
                      value,
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={question.is_required}
                onCheckedChange={(checked) =>
                  updateQuestionField(
                    pageIndex,
                    questionIndex,
                    "is_required",
                    checked,
                  )
                }
              />
              <Label>Required</Label>
            </div>
          </div>

          {showOptions && (
            <div>
              <Label>Options</Label>
              <div className="space-y-2">
                {question.options?.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex gap-2">
                    <Input
                      value={option.option_value}
                      onChange={(e) =>
                        updateOptionField(
                          pageIndex,
                          questionIndex,
                          optionIndex,
                          "option_value",
                          e.target.value,
                        )
                      }
                      placeholder="Value"
                      className="flex-1"
                    />
                    <Input
                      value={option.option_label}
                      onChange={(e) =>
                        updateOptionField(
                          pageIndex,
                          questionIndex,
                          optionIndex,
                          "option_label",
                          e.target.value,
                        )
                      }
                      placeholder="Label"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        removeOption(pageIndex, questionIndex, optionIndex)
                      }
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
  );
}

function SurveyPageSection({
  page,
  pageIndex,
  canRemove,
  handlers,
}: {
  page: SurveyPageFormData;
  pageIndex: number;
  canRemove: boolean;
  handlers: SurveyFormHandlers;
}) {
  const { addQuestion, removePage, updatePageField } = handlers;

  return (
    <Section variant="flat" className="mb-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex-1">
          <Input
            value={page.title}
            onChange={(e) =>
              updatePageField(pageIndex, "title", e.target.value)
            }
            placeholder="Page title"
            className="text-lg font-semibold"
            aria-label={`Page ${pageIndex + 1} title`}
          />
        </div>
        {canRemove && (
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
          <SurveyQuestionCard
            key={question.question_id}
            question={question}
            pageIndex={pageIndex}
            questionIndex={questionIndex}
            handlers={handlers}
          />
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
  );
}

/**
 * The survey builder form, shared by the create and edit survey routes
 * (#1892). The two routes were ~90% identical; only the page chrome, the
 * submit target, and whether the Survey ID is editable differ.
 */
export interface SurveyFormProps {
  initialFormData: SurveyFormData;
  onSubmit: (formData: SurveyFormData) => void;
  submitLabel: string;
  submittingLabel: string;
  isSubmitting: boolean;
  error?: string | null;
  /** The edit route locks the Survey ID after creation. */
  surveyIdReadOnly?: boolean;
}

export function SurveyForm({
  initialFormData,
  onSubmit,
  submitLabel,
  submittingLabel,
  isSubmitting,
  error,
  surveyIdReadOnly = false,
}: SurveyFormProps) {
  const handlers = useSurveyForm(initialFormData);
  const { formData, addPage, updateField } = handlers;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(formData);
  };

  return (
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
              disabled={surveyIdReadOnly}
            />
            {surveyIdReadOnly && (
              <p className="text-sm text-muted-foreground mt-1">
                Survey ID cannot be changed after creation
              </p>
            )}
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
        <SurveyPageSection
          key={page.page_id}
          page={page}
          pageIndex={pageIndex}
          canRemove={formData.pages.length > 1}
          handlers={handlers}
        />
      ))}

      {error && (
        <p role="alert" className="text-sm text-destructive-text mb-4">
          {error}
        </p>
      )}

      <div className="flex gap-4">
        <Button type="button" variant="outline" onClick={addPage}>
          <Plus className="w-4 h-4 mr-2" />
          Add Page
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          <Save className="w-4 h-4 mr-2" />
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
