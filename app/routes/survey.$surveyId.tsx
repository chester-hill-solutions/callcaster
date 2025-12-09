import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { SurveyQuestionType, SurveyAnswerData, SurveyQuestionWithOptions, ResponseAnswer } from "@/lib/types";
import { useDebounce } from "@/hooks/utils/useDebounce";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { surveyId } = params;
  const url = new URL(request.url);
  const contactId = url.searchParams.get('contact');

  if (!surveyId) {
    throw new Response("Survey ID is required", { status: 400 });
  }

  const { supabaseClient } = createSupabaseServerClient(request);

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
    .eq("is_active", true)
    .single();

  if (surveyError || !survey) {
    throw new Response("Survey not found or inactive", { status: 404 });
  }

  // Get contact information if contactId is provided
  let contact = null;
  if (contactId) {
    const { data: contactData, error: contactError } = await supabaseClient
      .from("contact")
      .select("*")
      .eq("id", parseInt(contactId))
      .single();
    
    if (!contactError && contactData) {
      contact = contactData;
    }
  }

  // Generate a unique result ID
  const resultId = `result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Check for existing survey response
  let existingResponse = null;
  let existingAnswers = {};
  
  if (contact?.id) {
    const { data: response, error: responseError } = await supabaseClient
      .from("survey_response")
      .select(`
        *,
        response_answer(
          *,
          survey_question(question_id)
        )
      `)
      .eq("survey_id", survey.id)
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!responseError && response) {
      existingResponse = response;
      // Convert answers to the format expected by the component
      existingAnswers = response.response_answer?.reduce((acc: Record<string, string | string[]>, answer: ResponseAnswer & { survey_question: SurveyQuestionWithOptions }) => {
        const questionId = answer.survey_question.question_id.toString();
        acc[questionId] = answer.answer_value as string | string[];
        return acc;
      }, {}) || {};
    }
  }

  return json({
    survey,
    resultId: existingResponse?.result_id || resultId,
    contact,
    existingResponse,
    existingAnswers,
  });
}

export default function SurveyPage() {
  const { survey, resultId, contact, existingResponse, existingAnswers } = useLoaderData<typeof loader>();
  const answerFetcher = useFetcher();
  const completeFetcher = useFetcher();
  
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(existingAnswers);
  const [isCompleted, setIsCompleted] = useState(false);

  const currentPage = survey.survey_page[currentPageIndex];
  const totalPages = survey.survey_page.length;
  const progress = ((currentPageIndex + 1) / totalPages) * 100;

  // Create a debounced save function for text fields
  const debouncedSave = useDebounce((questionId: string, value: string | string[]) => {
    const formData = new FormData();
    formData.append("surveyId", survey.survey_id);
    formData.append("questionId", questionId);
    formData.append("answerValue", Array.isArray(value) ? JSON.stringify(value) : value);
    formData.append("contactId", contact?.id?.toString() || "");
    formData.append("resultId", resultId);
    formData.append("pageId", currentPage.page_id);

    answerFetcher.submit(formData, {
      method: "POST",
      action: "/api/survey-answer",
    });
  }, 1000); // 1 second delay

  const handleAnswerChange = (questionId: string, value: string | string[]) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));

    // Don't save write-in fields separately
    if (questionId.endsWith('_writein')) {
      return;
    }

    // Use debounced save for text fields, immediate save for others
    const currentQuestion = currentPage.survey_question?.find((q: SurveyQuestionWithOptions) => q.question_id === questionId);
    const isTextField = currentQuestion?.question_type === "text" || currentQuestion?.question_type === "textarea";
    
    if (isTextField) {
      debouncedSave(questionId, value);
    } else {
      // Save immediately for radio, checkbox, etc.
      const formData = new FormData();
      formData.append("surveyId", survey.survey_id);
      formData.append("questionId", questionId);
      formData.append("answerValue", Array.isArray(value) ? JSON.stringify(value) : value);
      formData.append("contactId", contact?.id?.toString() || "");
      formData.append("resultId", resultId);
      formData.append("pageId", currentPage.page_id);

      answerFetcher.submit(formData, {
        method: "POST",
        action: "/api/survey-answer",
      });
    }
  };

  const handleNext = () => {
    if (currentPageIndex < totalPages - 1) {
      setCurrentPageIndex(prev => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrevious = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prev => prev - 1);
    }
  };

  const handleSubmit = () => {
    // Mark survey as completed using fetcher
    const formData = new FormData();
    formData.append("resultId", resultId);
    formData.append("surveyId", survey.survey_id);
    formData.append("completed", "true");

    completeFetcher.submit(formData, {
      method: "POST",
      action: "/api/survey-complete",
    });

    setIsCompleted(true);
  };

  const renderQuestion = (question: SurveyQuestionWithOptions) => {
    const questionId = question.question_id;
    const currentAnswer = answers[questionId];
    
    // Derive status from fetcher state
    const getQuestionStatus = () => {
      const formData = answerFetcher.formData as FormData | null;
      if (answerFetcher.state === "submitting" && formData?.get("questionId") === questionId) {
        return 'saving';
      }
      const fetcherData = answerFetcher.data as { success?: boolean; error?: string } | null;
      if (answerFetcher.state === "idle" && fetcherData?.success && formData?.get("questionId") === questionId) {
        return 'saved';
      }
      if (answerFetcher.state === "idle" && fetcherData?.error && formData?.get("questionId") === questionId) {
        return 'error';
      }
      return null;
    };

    const renderStatusIndicator = () => {
      const status = getQuestionStatus();
      if (!status) return null;
      
      return (
        <div className="flex items-center gap-2 mt-1">
          {status === 'saving' && (
            <div className="flex items-center gap-1 text-blue-600 text-xs">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              Saving...
            </div>
          )}
          {status === 'saved' && (
            <div className="flex items-center gap-1 text-green-600 text-xs">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Saved
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-1 text-red-600 text-xs">
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
              className="bg-white text-black"
              id={questionId}
              value={currentAnswer || ""}
              onChange={(e) => handleAnswerChange(questionId, e.target.value)}
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
              className="bg-white text-black"
              id={questionId}
              value={currentAnswer || ""}
              onChange={(e) => handleAnswerChange(questionId, e.target.value)}
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
                      onChange={(e) => handleAnswerChange(questionId, e.target.value)}
                      required={question.is_required}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
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
                    value={answers[`${questionId}_writein`] || ""}
                    onChange={(e) => {
                      setAnswers(prev => ({
                        ...prev,
                        [`${questionId}_writein`]: e.target.value
                      }));
                      // Trigger debounced save of the main answer with the write-in text
                      const writeInText = e.target.value;
                      const answerValue = writeInText ? `${currentAnswer}: ${writeInText}` : currentAnswer;
                      
                      debouncedSave(questionId, answerValue);
                    }}
                    className="w-full bg-white text-black"
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
                      id={`${questionId}-${option.id}`}
                      checked={currentAnswer?.includes?.(option.option_value) || false}
                      onCheckedChange={(checked) => {
                        const currentValues = currentAnswer || [];
                        if (checked) {
                          handleAnswerChange(questionId, [...currentValues, option.option_value]);
                        } else {
                          handleAnswerChange(questionId, currentValues.filter((v: string) => v !== option.option_value));
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
              ) && currentAnswer && currentAnswer.length > 0 && (
                <div className="ml-6 mt-2">
                  <Input
                    placeholder="Please specify..."
                    value={answers[`${questionId}_writein`] || ""}
                    onChange={(e) => {
                      setAnswers(prev => ({
                        ...prev,
                        [`${questionId}_writein`]: e.target.value
                      }));
                      // Trigger debounced save of the main answer with the write-in text
                      const writeInText = e.target.value;
                      const currentValues = currentAnswer || [];
                      const processedValues = currentValues.map((v: string) => {
                        // Find if any selected option has (write in)
                        const selectedOption = question.question_option?.find((opt) => opt.option_value === v);
                        if (selectedOption?.option_label?.toLowerCase().includes("(write in)")) {
                          return writeInText ? `${v}: ${writeInText}` : v;
                        }
                        return v;
                      });
                      
                      debouncedSave(questionId, processedValues);
                    }}
                    className="w-full bg-white text-black"
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Thank You!</h2>
              <p className="text-gray-600 mt-2">
                Your response has been submitted successfully.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-8">
      <Card className="w-full max-w-2xl mx-4">
        <CardHeader>
          <div className="mb-4">
            <Progress value={progress} className="mb-2" />
            <p className="text-sm text-gray-600">
              Page {currentPageIndex + 1} of {totalPages}
            </p>
          </div>
          <CardTitle className="text-2xl">{survey.title}</CardTitle>
          <CardDescription>{currentPage.title}</CardDescription>
          {contact && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                Welcome, {contact.firstname || contact.surname || 'Valued Customer'}!
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {currentPage.survey_question?.map((question: SurveyQuestionWithOptions) => (
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
              disabled={completeFetcher.state === "submitting"}
            >
              {currentPageIndex === totalPages - 1 ? "Submit" : "Next"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 