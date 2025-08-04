import type { Database } from "./database.types";

// Database table types
export type Call = Database["public"]["Tables"]["call"]["Row"] & {
  contact: {
    firstname: string | null;
    surname: string | null;
    phone: string | null;
  } | null;
  campaign: {
    id: number;
    title: string;
    call_questions?: any;
    live_campaign?: {
      id: number;
      script?: {
        id: number;
        name: string;
        type: string;
        steps: {
          pages: Record<string, any>;
          blocks: Record<string, any>;
        };
        workspace: string;
        created_at: string;
        created_by: string;
        updated_at: string | null;
        updated_by: string | null;
      };
    }[];
  } | null;
  outreach_attempt: {
    disposition: string | null;
    answered_at: string | null;
    ended_at: string | null;
    result?: any;
    user_id?: {
      id: string;
      username: string;
    } | null;
  } | null;
};

export type Campaign = Database["public"]["Tables"]["campaign"]["Row"] & {
  outreach_attempt: { count: number }[];
  call: { count: number }[];
};

export type OutreachAttempt = Database["public"]["Tables"]["outreach_attempt"]["Row"] & {
  campaign: {
    title: string;
  };
  contact: {
    firstname: string | null;
    surname: string | null;
    phone: string | null;
  };
  user: {
    username: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

// Analytics metrics
export interface AnalyticsMetrics {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  voicemailCalls: number;
  completionRate: number;
  averageCallDuration: number;
  activeCampaigns: number;
  totalCampaigns: number;
  liveCallCount: number;
}

// Component props
export interface LiveCallAnalyticsProps {
  liveCalls: Call[];
  recentCalls: Call[];
  metrics: AnalyticsMetrics;
  pagination?: {
    currentPage: number;
    pageSize: number;
    totalCalls: number;
    totalPages: number;
  };
  allQuestions?: string[];
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export interface WorkspaceOverviewProps {
  campaigns: Campaign[];
  outreachAttempts: OutreachAttempt[];
  metrics: AnalyticsMetrics;
}

export interface CampaignPerformanceProps {
  campaigns: Campaign[];
  outreachAttempts: OutreachAttempt[];
}

export interface CallMetricsProps {
  recentCalls: Call[];
  metrics: AnalyticsMetrics;
}

// Utility types
export type CallStatus = Database["public"]["Enums"]["call_status"];
export type CampaignStatus = Database["public"]["Enums"]["campaign_status"];
export type CampaignType = Database["public"]["Enums"]["campaign_type"];
export type AnsweredBy = Database["public"]["Enums"]["answered_by"];

export interface QuestionAnswer {
  question: string;
  answer: string | number | boolean | null;
  questionType?: string;
  options?: string[];
  key?: string;
}

export interface CallWithQuestions extends Call {
  questions?: QuestionAnswer[];
  campaignQuestions?: any;
}

export function extractScriptQuestions(call: Call): QuestionAnswer[] {
  const questions: QuestionAnswer[] = [];
  
  // Get script data from live_campaign
  const script = call.campaign?.live_campaign?.[0]?.script;
  const scriptSteps = script?.steps;
  
  // First check top-level blocks
  if (scriptSteps?.blocks && typeof scriptSteps.blocks === 'object') {
    const blocks = scriptSteps.blocks as Record<string, any>;
    
    Object.entries(blocks).forEach(([blockId, block]: [string, any]) => {
      // Only include interactive blocks (questions)
      if (['dropdown', 'select', 'radio', 'text', 'textarea'].includes(block.type)) {
        const questionText = block.content || block.value || block.title || blockId;
        const options = block.options && Array.isArray(block.options) 
          ? block.options.map((opt: any) => opt.content || opt.value || opt)
          : [];
        
        questions.push({
          question: questionText,
          answer: null, // No answer provided
          questionType: block.type,
          options,
          key: blockId // Use block ID as the key
        });
      }
    });
  }
  
  // Then check pages for questions
  if (scriptSteps?.pages && typeof scriptSteps.pages === 'object') {
    const pages = scriptSteps.pages as Record<string, any>;
    
    Object.entries(pages).forEach(([pageId, page]: [string, any]) => {
      if (page.blocks && typeof page.blocks === 'object') {
        Object.entries(page.blocks).forEach(([pageBlockId, pageBlock]: [string, any]) => {
          // Only include interactive blocks (questions)
          if (['dropdown', 'select', 'radio', 'text', 'textarea'].includes(pageBlock.type)) {
            const questionText = pageBlock.content || pageBlock.value || pageBlock.title || pageBlockId;
            const options = pageBlock.options && Array.isArray(pageBlock.options) 
              ? pageBlock.options.map((opt: any) => opt.content || opt.value || opt)
              : [];
            
            questions.push({
              question: questionText,
              answer: null, // No answer provided
              questionType: pageBlock.type,
              options,
              key: `${pageId}_${pageBlockId}` // Use page_block format as key
            });
          }
        });
      }
    });
  }
  
  return questions;
}

// Utility functions to parse questions and answers
export function parseQuestionsAndAnswers(call: Call): QuestionAnswer[] {
  const questions: QuestionAnswer[] = [];
  
  // Get script data from live_campaign
  const script = call.campaign?.live_campaign?.[0]?.script;
  const scriptSteps = script?.steps;
  
  // First try outreach_attempt.result (where answers are actually stored)
  if (call.outreach_attempt?.result && typeof call.outreach_attempt.result === 'object') {
    const result = call.outreach_attempt.result as Record<string, any>;
    
    Object.entries(result).forEach(([blockId, value]) => {
      // Skip recording/response objects that don't contain question data
      if (blockId === 'Response' || (typeof value === 'object' && value !== null && 'recordingUrl' in value)) {
        return;
      }
      
      let questionText = blockId;
      let questionType = 'text';
      let options: string[] = [];
      
      // If the blockId starts with "page_", it's a page-level result
      // We need to look inside the page to find the actual questions
      if (blockId.startsWith('page_') && typeof value === 'object' && value !== null) {
        // This is a page with nested question data
        Object.entries(value).forEach(([questionKey, answerValue]) => {
          // Skip recording/response objects
          if (questionKey === 'Response' || (typeof answerValue === 'object' && answerValue !== null && 'recordingUrl' in answerValue)) {
            return;
          }
          
          let nestedQuestionText = questionKey;
          let nestedQuestionType = 'text';
          let nestedOptions: string[] = [];
          
          // Try to find question details from script blocks
          if (scriptSteps?.pages && typeof scriptSteps.pages === 'object') {
            const pages = scriptSteps.pages as Record<string, any>;
            const page = pages[blockId];
            
            if (page && page.blocks && typeof page.blocks === 'object') {
              Object.entries(page.blocks).forEach(([pageBlockId, pageBlock]: [string, any]) => {
                if (['dropdown', 'select', 'radio', 'text', 'textarea'].includes(pageBlock.type)) {
                  // Match by title or content
                  if (pageBlock.title === questionKey || pageBlock.content === questionKey) {
                    nestedQuestionText = pageBlock.content || pageBlock.title || questionKey;
                    nestedQuestionType = pageBlock.type || 'text';
                    
                    // Extract options for dropdown/select questions
                    if (pageBlock.options && Array.isArray(pageBlock.options)) {
                      nestedOptions = pageBlock.options.map((opt: any) => opt.content || opt.value || opt);
                    }
                  }
                }
              });
            }
          }
          
                     questions.push({
             question: nestedQuestionText,
             answer: answerValue as string | number | boolean | null,
             questionType: nestedQuestionType,
             options: nestedOptions,
             key: `${blockId}_${questionKey}`
           });
        });
      } else {
        // This might be a direct question/answer pair
        // Try to find question details from script blocks
        if (scriptSteps?.blocks && typeof scriptSteps.blocks === 'object') {
          const blocks = scriptSteps.blocks as Record<string, any>;
          const block = blocks[blockId];
          
          if (block) {
            questionText = block.content || block.value || block.title || blockId;
            questionType = block.type || 'text';
            
            // Extract options for dropdown/select questions
            if (block.options && Array.isArray(block.options)) {
              options = block.options.map((opt: any) => opt.content || opt.value || opt);
            }
          }
        }
        
        questions.push({
          question: questionText,
          answer: value,
          questionType,
          options,
          key: blockId
        });
      }
    });
  }
  
  // Fallback to call.answers (though this seems to be empty)
  if (questions.length === 0 && call.answers && typeof call.answers === 'object') {
    const answers = call.answers as Record<string, any>;
    
    Object.entries(answers).forEach(([key, value]) => {
      let questionText = key;
      let questionType = 'text';
      let options: string[] = [];
      
      // Try to find question details from script blocks
      if (scriptSteps?.blocks && typeof scriptSteps.blocks === 'object') {
        const blocks = scriptSteps.blocks as Record<string, any>;
        const block = blocks[key];
        
        if (block) {
          questionText = block.content || block.value || block.title || key;
          questionType = block.type || 'text';
          
          // Extract options for dropdown/select questions
          if (block.options && Array.isArray(block.options)) {
            options = block.options.map((opt: any) => opt.content || opt.value || opt);
          }
        }
      }
      
      questions.push({
        question: questionText,
        answer: value,
        questionType,
        options,
        key: key
      });
    });
  }
  
  // If no answers found, show available questions from script
  if (questions.length === 0) {
    return extractScriptQuestions(call);
  }
  
  // If still no questions, try to get them from campaign.call_questions
  if (questions.length === 0 && call.campaign?.call_questions) {
    try {
      const campaignQuestions = call.campaign.call_questions;
      if (typeof campaignQuestions === 'object' && campaignQuestions !== null) {
        Object.entries(campaignQuestions).forEach(([questionKey, questionData]: [string, any]) => {
          if (typeof questionData === 'object' && questionData !== null) {
            questions.push({
              question: questionData.title || questionData.content || questionKey,
              answer: null, // No answer provided
              questionType: questionData.type || 'text',
              options: questionData.options || [],
              key: questionKey
            });
          }
        });
      }
    } catch (error) {
      console.error('Error parsing campaign questions:', error);
    }
  }
  
  return questions;
}

export function formatAnswer(answer: any, questionType?: string): string {
  if (answer === null || answer === undefined) {
    return 'No answer';
  }
  
  switch (questionType) {
    case 'boolean':
      return answer ? 'Yes' : 'No';
    case 'number':
      return answer.toString();
    case 'dropdown':
    case 'select':
    case 'radio':
      return answer.toString();
    case 'infotext':
      return 'Information provided';
    case 'text':
    case 'textarea':
      return answer.toString();
    default:
      return answer.toString();
  }
} 