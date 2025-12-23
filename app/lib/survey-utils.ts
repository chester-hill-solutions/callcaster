import type { Json } from './database.types';
import { safeString, safeNumber, safeBoolean, isArray, isObject } from './type-utils';

// Type-safe survey question types
export interface SurveyQuestionData {
  question_id: string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  question_order: number;
  question_option?: Array<{
    option_value: string;
    option_label: string;
    option_order: number;
  }>;
}

// Type-safe survey page data
export interface SurveyPageData {
  page_id: string;
  title: string;
  page_order: number;
  survey_question?: SurveyQuestionData[];
}

// Type-safe survey data
export interface SurveyData {
  survey_id: string;
  title: string;
  is_active: boolean;
  survey_page?: SurveyPageData[];
}

// Type-safe survey answer data
export interface SurveyAnswerData {
  question_id: string;
  answer_value: string;
}

// Type-safe survey response data
export interface SurveyResponseData {
  result_id: string;
  survey_id: string;
  contact_id?: number;
  response_answer?: SurveyAnswerData[];
}

// Type-safe survey utilities
export class SurveyUtils {
  // Safely extract survey data from unknown input
  static parseSurveyData(data: unknown): SurveyData | null {
    if (!isObject(data)) return null;
    
    const obj = data as Record<string, unknown>;
    
    return {
      survey_id: safeString(obj.survey_id),
      title: safeString(obj.title),
      is_active: safeBoolean(obj.is_active),
      survey_page: this.parseSurveyPages(obj.survey_page),
    };
  }

  // Safely parse survey pages
  static parseSurveyPages(pages: unknown): SurveyPageData[] {
    if (!isArray(pages)) return [];
    
    return pages
      .map(page => this.parseSurveyPage(page))
      .filter((page): page is SurveyPageData => page !== null);
  }

  // Safely parse a single survey page
  static parseSurveyPage(page: unknown): SurveyPageData | null {
    if (!isObject(page)) return null;
    
    const obj = page as Record<string, unknown>;
    
    return {
      page_id: safeString(obj.page_id),
      title: safeString(obj.title),
      page_order: safeNumber(obj.page_order),
      survey_question: this.parseSurveyQuestions(obj.survey_question),
    };
  }

  // Safely parse survey questions
  static parseSurveyQuestions(questions: unknown): SurveyQuestionData[] {
    if (!isArray(questions)) return [];
    
    return questions
      .map(question => this.parseSurveyQuestion(question))
      .filter((question): question is SurveyQuestionData => question !== null);
  }

  // Safely parse a single survey question
  static parseSurveyQuestion(question: unknown): SurveyQuestionData | null {
    if (!isObject(question)) return null;
    
    const obj = question as Record<string, unknown>;
    
    return {
      question_id: safeString(obj.question_id),
      question_text: safeString(obj.question_text),
      question_type: safeString(obj.question_type),
      is_required: safeBoolean(obj.is_required),
      question_order: safeNumber(obj.question_order),
      question_option: this.parseQuestionOptions(obj.question_option),
    };
  }

  // Safely parse question options
  static parseQuestionOptions(options: unknown): Array<{ option_value: string; option_label: string; option_order: number }> {
    if (!isArray(options)) return [];
    
    return options
      .map(option => this.parseQuestionOption(option))
      .filter((option): option is { option_value: string; option_label: string; option_order: number } => option !== null);
  }

  // Safely parse a single question option
  static parseQuestionOption(option: unknown): { option_value: string; option_label: string; option_order: number } | null {
    if (!isObject(option)) return null;
    
    const obj = option as Record<string, unknown>;
    
    return {
      option_value: safeString(obj.option_value),
      option_label: safeString(obj.option_label),
      option_order: safeNumber(obj.option_order),
    };
  }

  // Safely parse survey response data
  static parseSurveyResponseData(data: unknown): SurveyResponseData | null {
    if (!isObject(data)) return null;
    
    const obj = data as Record<string, unknown>;
    
    return {
      result_id: safeString(obj.result_id),
      survey_id: safeString(obj.survey_id),
      contact_id: obj.contact_id ? safeNumber(obj.contact_id) : undefined,
      response_answer: this.parseSurveyAnswers(obj.response_answer),
    };
  }

  // Safely parse survey answers
  static parseSurveyAnswers(answers: unknown): SurveyAnswerData[] {
    if (!isArray(answers)) return [];
    
    return answers
      .map(answer => this.parseSurveyAnswer(answer))
      .filter((answer): answer is SurveyAnswerData => answer !== null);
  }

  // Safely parse a single survey answer
  static parseSurveyAnswer(answer: unknown): SurveyAnswerData | null {
    if (!isObject(answer)) return null;
    
    const obj = answer as Record<string, unknown>;
    
    return {
      question_id: safeString(obj.question_id),
      answer_value: safeString(obj.answer_value),
    };
  }

  // Convert survey answers to a map for easy access
  static answersToMap(answers: SurveyAnswerData[]): Record<string, string> {
    return answers.reduce((acc, answer) => {
      acc[answer.question_id] = answer.answer_value;
      return acc;
    }, {} as Record<string, string>);
  }

  // Convert map back to survey answers
  static mapToAnswers(answersMap: Record<string, unknown>): SurveyAnswerData[] {
    return Object.entries(answersMap)
      .map(([questionId, value]) => ({
        question_id: questionId,
        answer_value: safeString(value),
      }))
      .filter(answer => answer.answer_value !== '');
  }

  // Validate survey question type
  static isValidQuestionType(type: string): type is SurveyQuestionType {
    return ['text', 'radio', 'checkbox', 'textarea'].includes(type);
  }

  // Get question type enum
  static getQuestionType(type: string): SurveyQuestionType {
    return this.isValidQuestionType(type) ? type : 'text';
  }

  // Safely get current page from survey data
  static getCurrentPage(survey: SurveyData, pageIndex: number): SurveyPageData | null {
    if (!survey.survey_page || pageIndex < 0 || pageIndex >= survey.survey_page.length) {
      return null;
    }
    return survey.survey_page[pageIndex];
  }

  // Safely get total pages count
  static getTotalPages(survey: SurveyData): number {
    return survey.survey_page?.length || 0;
  }

  // Calculate progress percentage
  static calculateProgress(currentPageIndex: number, totalPages: number): number {
    if (totalPages === 0) return 0;
    return ((currentPageIndex + 1) / totalPages) * 100;
  }

  // Validate survey data structure
  static validateSurveyData(data: unknown): data is SurveyData {
    const survey = this.parseSurveyData(data);
    return survey !== null && 
           survey.survey_id !== '' && 
           survey.title !== '' && 
           survey.is_active === true;
  }

  // Create a safe survey form data object
  static createSurveyFormData(data: Record<string, unknown>): FormData {
    const formData = new FormData();
    
    Object.entries(data).forEach(([key, value]) => {
      if (value != null) {
        if (isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, safeString(value));
        }
      }
    });
    
    return formData;
  }
}

// Type-safe survey question type enum
export type SurveyQuestionType = 'text' | 'radio' | 'checkbox' | 'textarea';

// Type-safe survey validation rules
export const SurveyValidationRules = {
  required: (value: unknown): boolean => {
    if (isArray(value)) return value.length > 0;
    return safeString(value).trim().length > 0;
  },
  
  email: (value: unknown): boolean => {
    const email = safeString(value);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },
  
  phone: (value: unknown): boolean => {
    const phone = safeString(value);
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  },
  
  minLength: (min: number) => (value: unknown): boolean => {
    return safeString(value).length >= min;
  },
  
  maxLength: (max: number) => (value: unknown): boolean => {
    return safeString(value).length <= max;
  },
};

// Type-safe survey error types
export interface SurveyError {
  field: string;
  message: string;
  code: string;
}

// Type-safe survey validation result
export interface SurveyValidationResult {
  isValid: boolean;
  errors: SurveyError[];
}

// Type-safe survey validator
export class SurveyValidator {
  static validateQuestion(
    question: SurveyQuestionData, 
    value: unknown
  ): SurveyValidationResult {
    const errors: SurveyError[] = [];
    
    // Check if required
    if (question.is_required && !SurveyValidationRules.required(value)) {
      errors.push({
        field: question.question_id,
        message: `${question.question_text} is required`,
        code: 'REQUIRED',
      });
    }
    
    // Validate based on question type
    switch (question.question_type) {
      case 'text':
        if (SurveyValidationRules.required(value)) {
          if (!SurveyValidationRules.minLength(1)(value)) {
            errors.push({
              field: question.question_id,
              message: `${question.question_text} must not be empty`,
              code: 'MIN_LENGTH',
            });
          }
        }
        break;
        
      case 'radio':
      case 'checkbox':
        if (question.is_required && !SurveyValidationRules.required(value)) {
          errors.push({
            field: question.question_id,
            message: `Please select an option for ${question.question_text}`,
            code: 'REQUIRED',
          });
        }
        break;
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }
} 