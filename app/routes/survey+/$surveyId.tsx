export { loader } from "./$surveyId.loader.server";
import type { PublicSurveyLoaderData } from "./$surveyId.loader.server";

import { useLoaderData } from "react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { SurveyQuestionType } from "@/lib/types";
import { useSurveySubmission } from "@/hooks/surveys/useSurveySubmission";
import { hydrateSurveyAnswers, surveyAnswerKey, withSurveyWriteIn } from "@/lib/survey-answer-state";
import { Alert, AlertDescription } from "@/components/ui/alert";

type LoaderQuestionOption = {
  id: number;
  option_value: string;
  option_label: string;
  option_order: number;
};

type LoaderQuestion = {
  id: number;
  question_id: string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  question_option?: LoaderQuestionOption[];
};

type ExistingAnswerRow = {
  answer_value: string;
  survey_question: { question_id: string };
};

export default function SurveyPage() {
  const data = useLoaderData<PublicSurveyLoaderData>();
  return <SurveyRespondentPage key={`${data.survey.survey_id}:${data.resultId}`} data={data} />;
}

function SurveyRespondentPage({ data }: {
  data: PublicSurveyLoaderData;
}) {
  const { survey, resultId, respondentToken, contact, existingResponse, existingAnswers } = data;
  const { queueAnswer, savePage, statusFor, error, isBusy, isCompleted } = useSurveySubmission({
    surveyId: survey.survey_id, resultId, respondentToken, contactId: contact?.id ?? null,
  });
  
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [{ answers, writeIns }, setAnswerState] = useState(() => hydrateSurveyAnswers(survey.survey_page ?? [], existingAnswers));

  const currentPage = survey.survey_page?.[currentPageIndex];
  const totalPages = survey.survey_page?.length || 0;
  const progress = totalPages > 0 ? ((currentPageIndex + 1) / totalPages) * 100 : 0;

  // Early return if no current page
  if (!currentPage) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Survey Not Found</h1>
          <p className="text-muted-foreground">The survey page could not be loaded.</p>
        </div>
      </div>
    );
  }

  const queuePageAnswer = (questionId: string, value: string | string[]) => {
    queueAnswer({ questionId, value, pageId: currentPage.page_id });
  };

  const handleAnswerChange = (question: LoaderQuestion, value: string | string[]) => {
    if (isBusy) return;
    const key = surveyAnswerKey(currentPage.page_id, question.question_id);
    setAnswerState(prev => ({ ...prev, answers: { ...prev.answers, [key]: value } }));
    queuePageAnswer(question.question_id, withSurveyWriteIn(value, writeIns[key] ?? "", question.question_option ?? []));
  };

  const handleWriteInChange = (question: LoaderQuestion, value: string) => {
    if (isBusy) return;
    const key = surveyAnswerKey(currentPage.page_id, question.question_id);
    setAnswerState(prev => ({ ...prev, writeIns: { ...prev.writeIns, [key]: value } }));
    queuePageAnswer(question.question_id, withSurveyWriteIn(answers[key] ?? "", value, question.question_option ?? []));
  };

  const handleNext = async () => {
    const complete = currentPageIndex === totalPages - 1;
    if (await savePage(complete) && !complete) setCurrentPageIndex(prev => prev + 1);
  };

  const handlePrevious = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prev => prev - 1);
    }
  };

  const renderQuestion = (question: LoaderQuestion) => {
    const questionId = question.question_id;
    const key = surveyAnswerKey(currentPage.page_id, questionId);
    const currentAnswer = answers[key];
    
    const status = statusFor(currentPage.page_id, questionId);

    const renderStatusIndicator = () => {
      if (!status || status === "pending") return null;
      
      return (
        <div className="flex items-center gap-2 mt-1">
          {status === 'saving' && (
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              Saving...
            </div>
          )}
          {status === 'saved' && (
            <div className="flex items-center gap-1 text-success-text text-xs">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Saved
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-1 text-destructive-text text-xs">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Error saving
            </div>
          )}
        </div>
      );
    };

    switch (question.question_type as SurveyQuestionType) {
      case "text":
        return (
          <div className="space-y-2">
            <Label htmlFor={questionId}>{question.question_text}</Label>
            <Input
              className="bg-background text-foreground"
              id={questionId}
              value={currentAnswer || ""}
              onChange={(e) => handleAnswerChange(question, e.target.value)}
              required={question.is_required}
            />
            {renderStatusIndicator()}
          </div>
        );

      case "textarea":
        return (
          <div className="space-y-2">
            <Label htmlFor={questionId}>{question.question_text}</Label>
            <Textarea
              className="bg-background text-foreground"
              id={questionId}
              value={currentAnswer || ""}
              onChange={(e) => handleAnswerChange(question, e.target.value)}
              required={question.is_required}
              rows={4}
            />
            {renderStatusIndicator()}
          </div>
        );

      case "radio":
        return (
          <div className="space-y-2">
            <Label>{question.question_text}</Label>
            <div className="space-y-2">
              {question.question_option?.map((option) => {
                const isWriteIn = option.option_label?.toLowerCase().includes("(write in)");
                const cleanLabel = isWriteIn ? option.option_label.replace(/\(write in\)/i, "").trim() : option.option_label;
                
                return (
                  <div key={option.id} className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id={`${questionId}-${option.id}`}
                      name={questionId}
                      value={option.option_value}
                      checked={currentAnswer === option.option_value}
                      onChange={(e) => handleAnswerChange(question, e.target.value)}
                      required={question.is_required}
                      className="w-4 h-4 text-primary bg-muted border-input focus:ring-ring"
                    />
                    <Label htmlFor={`${questionId}-${option.id}`}>{cleanLabel}</Label>
                  </div>
                );
              })}
              {/* Write-in field for options with (write in) */}
              {question.question_option?.some((option) => 
                option.option_label?.toLowerCase().includes("(write in)")
              ) && currentAnswer && (
                <div className="ml-6 mt-2">
                  <Input
                    placeholder="Please specify..."
                    value={writeIns[key] ?? ""}
                    onChange={(e) => handleWriteInChange(question, e.target.value)}
                    className="w-full bg-background text-foreground"
                  />
                </div>
              )}
            </div>
            {renderStatusIndicator()}
          </div>
        );

      case "checkbox":
        return (
          <div className="space-y-2">
            <Label>{question.question_text}</Label>
            <div className="space-y-2">
              {question.question_option?.map((option) => {
                const isWriteIn = option.option_label?.toLowerCase().includes("(write in)");
                const cleanLabel = isWriteIn ? option.option_label.replace(/\(write in\)/i, "").trim() : option.option_label;
                
                return (
                  <div key={option.id} className="flex items-center space-x-2">
                    <Checkbox
                      disabled={isBusy}
                      id={`${questionId}-${option.id}`}
                      checked={Array.isArray(currentAnswer) ? currentAnswer.includes(option.option_value) : false}
                      onCheckedChange={(checked) => {
                        const currentValues = Array.isArray(currentAnswer) ? currentAnswer : [];
                        if (checked) {
                          handleAnswerChange(question, [...currentValues, option.option_value]);
                        } else {
                          handleAnswerChange(question, currentValues.filter((v: string) => v !== option.option_value));
                        }
                      }}
                    />
                    <Label htmlFor={`${questionId}-${option.id}`}>{cleanLabel}</Label>
                  </div>
                );
              })}
              {/* Write-in field for options with (write in) */}
              {question.question_option?.some((option) => 
                option.option_label?.toLowerCase().includes("(write in)")
              ) && currentAnswer && Array.isArray(currentAnswer) && currentAnswer.length > 0 && (
                <div className="ml-6 mt-2">
                  <Input
                    placeholder="Please specify..."
                    value={writeIns[key] ?? ""}
                    onChange={(e) => handleWriteInChange(question, e.target.value)}
                    className="w-full bg-background text-foreground"
                  />
                </div>
              )}
            </div>
            {renderStatusIndicator()}
          </div>
        );

      default:
        return <p>Unsupported question type: {question.question_type}</p>;
    }
  };

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-muted/40 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="mb-4">
              <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-success-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Thank You!</h2>
              <p className="text-muted-foreground mt-2">
                Your response has been submitted successfully.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center py-8">
      <Card className="w-full max-w-2xl mx-4">
        <CardHeader>
          <div className="mb-4">
            <Progress value={progress} className="mb-2" />
            <p className="text-sm text-muted-foreground">
              Page {currentPageIndex + 1} of {totalPages}
            </p>
          </div>
          <CardTitle className="text-2xl">{survey.title}</CardTitle>
          <CardDescription>{currentPage.title}</CardDescription>
          {contact && (
            <div className="mt-4 p-3 bg-secondary rounded-lg">
              <p className="text-sm text-secondary-foreground">
                Welcome, {contact.firstname || contact.surname || 'Valued Customer'}!
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <fieldset disabled={isBusy} className="space-y-6">
          {currentPage.survey_question?.map((question: LoaderQuestion) => (
            <div key={question.id} className="space-y-4">
              {renderQuestion(question)}
            </div>
          ))}

          <div className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentPageIndex === 0}
            >
              Previous
            </Button>
            <Button
              onClick={handleNext}
              disabled={isBusy}
            >
              {currentPageIndex === totalPages - 1 ? "Submit" : "Next"}
            </Button>
          </div>
          </fieldset>
        </CardContent>
      </Card>
    </div>
  );
} 