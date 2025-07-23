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
      let questionText = blockId;
      let questionType = 'text';
      let options: string[] = [];
      
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