import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "./database.types";
import type { AccountInstance } from "twilio/lib/rest/api/v2010/account";

export type ENV = {
  SUPABASE_URL: string | undefined;
  SUPABASE_KEY: string | undefined;
  BASE_URL: string | undefined;
};

export type ContextType = {
  supabase: SupabaseClient;
  env: ENV;
};

export type Audience = Tables<"audience">;
export type Campaign = Tables<"campaign">;
export type Contact = Tables<"contact">;
export type Queue = Tables<"campaign_queue"> | null;
export type Message = Tables<"message"> | null;
export type OutreachAttempt = Tables<"outreach_attempt"> & {
  call: Call;
};
export type ContactAudience = Tables<"contact_audience"> | null;
export type CampaignAudience = Tables<"campaign_audience"> | null;
export type WorkspaceNumbers = Tables<"workspace_number"> | null;
export type LiveCampaign = Tables<"live_campaign">;
export type IVRCampaign = Tables<"ivr_campaign"> | null;
export type MessageCampaign = Tables<"message_campaign"> | null;

// Survey types
export type Survey = Tables<"survey">;
export type SurveyPage = Tables<"survey_page">;
export type SurveyQuestion = Tables<"survey_question">;
export type QuestionOption = Tables<"question_option">;
export type SurveyResponse = Tables<"survey_response">;
export type ResponseAnswer = Tables<"response_answer">;

// Extended survey types with relationships
export type SurveyWithPages = Survey & {
  pages: SurveyPageWithQuestions[];
};

export type SurveyPageWithQuestions = SurveyPage & {
  questions: SurveyQuestionWithOptions[];
};

export type SurveyQuestionWithOptions = SurveyQuestion & {
  options: QuestionOption[];
};

export type SurveyResponseWithAnswers = SurveyResponse & {
  answers: ResponseAnswer[];
  contact?: Contact | null;
};

// Survey question types enum
export type SurveyQuestionType = "text" | "radio" | "checkbox" | "textarea";

// Survey form types
export interface SurveyFormData {
  survey_id: string;
  title: string;
  is_active: boolean;
  pages: SurveyPageFormData[];
}

export interface SurveyPageFormData {
  page_id: string;
  title: string;
  page_order: number;
  questions: SurveyQuestionFormData[];
}

export interface SurveyQuestionFormData {
  question_id: string;
  question_text: string;
  question_type: SurveyQuestionType;
  is_required: boolean;
  question_order: number;
  options?: QuestionOptionFormData[];
}

export interface QuestionOptionFormData {
  option_value: string;
  option_label: string;
  option_order: number;
}

// Survey response types
export interface SurveyResponseData {
  survey_id: number;
  result_id: string;
  contact_id?: number | null;
  answers: SurveyAnswerData[];
}

export interface SurveyAnswerData {
  question_id: number;
  answer_value: string;
}
export type Script = Tables<"script">;
export type QueueItem = Tables<"campaign_queue"> & {
  contact: Contact;
};
export type CampaignQueue = Tables<"campaign_queue">;
export type Call = Tables<"call">;
export type User = Tables<"user"> | null;
export type WorkspaceInvite = Tables<"workspace_invite"> | null;
export type WorkspaceTable = Audience | Campaign | Contact | null;
export type WorkspaceWebhook = Tables<"webhook"> | null;
export type Workspace = Tables<"workspace"> | null;
export type WorkspaceNumber = Tables<"workspace_number"> | null;

export const TWILIO_TRAFFIC_CLASS_VALUES = [
  "a2p10dlc",
  "toll_free",
  "short_code",
  "alphanumeric",
  "international_long_code",
  "unknown",
] as const;

export const TWILIO_THROUGHPUT_PRODUCT_VALUES = [
  "none",
  "market_throughput",
  "account_based_throughput",
] as const;

export const TWILIO_MULTI_TENANCY_MODE_VALUES = [
  "none",
  "even",
  "weighted",
] as const;

export const TWILIO_MESSAGE_INTENT_VALUES = [
  "otp",
  "notifications",
  "fraud",
  "security",
  "customercare",
  "delivery",
  "education",
  "events",
  "polling",
  "announcements",
  "marketing",
] as const;

export const TWILIO_SEND_MODE_VALUES = [
  "from_number",
  "messaging_service",
] as const;

export const TWILIO_ONBOARDING_STATUS_VALUES = [
  "not_started",
  "planned",
  "requested",
  "enabled",
] as const;

export type TwilioTrafficClass = (typeof TWILIO_TRAFFIC_CLASS_VALUES)[number];
export type TwilioThroughputProduct = (typeof TWILIO_THROUGHPUT_PRODUCT_VALUES)[number];
export type TwilioMultiTenancyMode = (typeof TWILIO_MULTI_TENANCY_MODE_VALUES)[number];
export type TwilioMessageIntent = (typeof TWILIO_MESSAGE_INTENT_VALUES)[number];
export type TwilioSendMode = (typeof TWILIO_SEND_MODE_VALUES)[number];
export type TwilioOnboardingStatus = (typeof TWILIO_ONBOARDING_STATUS_VALUES)[number];
export type WorkspaceTwilioSyncStatus =
  | "never_synced"
  | "syncing"
  | "healthy"
  | "error";

export interface WorkspaceTwilioOpsAuditEntry {
  changedAt: string;
  actorUserId: string | null;
  actorUsername: string | null;
  summary: string;
}

export interface WorkspaceTwilioOpsConfig {
  trafficClass: TwilioTrafficClass;
  throughputProduct: TwilioThroughputProduct;
  multiTenancyMode: TwilioMultiTenancyMode;
  trafficShapingEnabled: boolean;
  defaultMessageIntent: TwilioMessageIntent | null;
  sendMode: TwilioSendMode;
  messagingServiceSid: string | null;
  onboardingStatus: TwilioOnboardingStatus;
  supportNotes: string;
  updatedAt: string | null;
  updatedBy: string | null;
  auditTrail: WorkspaceTwilioOpsAuditEntry[];
}

export interface WorkspaceTwilioPortalRecommendation {
  severity: "info" | "warning";
  message: string;
}

export interface WorkspaceTwilioPortalMetrics {
  recentOutboundCount: number;
  rawFromCount: number;
  messagingServiceCount: number;
  statusCounts: Partial<Record<Database["public"]["Enums"]["message_status"], number>>;
  numberTypes: string[];
}

export interface WorkspaceTwilioSyncSnapshot {
  accountStatus: string | null;
  accountFriendlyName: string | null;
  phoneNumberCount: number;
  numberTypes: string[];
  recentUsageCount: number;
  usageTotalPrice: number | null;
  lastSyncedAt: string | null;
  lastSyncStatus: WorkspaceTwilioSyncStatus;
  lastSyncError: string | null;
}

export const WORKSPACE_ONBOARDING_CHANNEL_VALUES = [
  "a2p10dlc",
  "rcs",
  "voice_compliance",
] as const;

export const WORKSPACE_ONBOARDING_STATUS_VALUES = [
  "not_started",
  "collecting_business",
  "provisioning",
  "submitting",
  "in_review",
  "approved",
  "rejected",
  "live",
] as const;

export const WORKSPACE_ONBOARDING_STEP_STATUS_VALUES = [
  "pending",
  "in_progress",
  "complete",
  "blocked",
] as const;

export const WORKSPACE_EMERGENCY_ADDRESS_STATUS_VALUES = [
  "not_started",
  "pending_validation",
  "validated",
  "invalid",
] as const;

export const WORKSPACE_TWILIO_AUTH_MODE_VALUES = [
  "auth_token",
  "api_key",
  "mixed",
] as const;

export type WorkspaceOnboardingChannel =
  (typeof WORKSPACE_ONBOARDING_CHANNEL_VALUES)[number];
export type WorkspaceOnboardingStatus =
  (typeof WORKSPACE_ONBOARDING_STATUS_VALUES)[number];
export type WorkspaceOnboardingStepStatus =
  (typeof WORKSPACE_ONBOARDING_STEP_STATUS_VALUES)[number];
export type WorkspaceEmergencyAddressStatus =
  (typeof WORKSPACE_EMERGENCY_ADDRESS_STATUS_VALUES)[number];
export type WorkspaceTwilioAuthMode =
  (typeof WORKSPACE_TWILIO_AUTH_MODE_VALUES)[number];

export interface WorkspaceOnboardingStepState {
  id: string;
  label: string;
  status: WorkspaceOnboardingStepStatus;
  description: string | null;
}

export interface WorkspaceMessagingBusinessProfile {
  legalBusinessName: string;
  businessType: string;
  websiteUrl: string;
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
  supportEmail: string;
  supportPhone: string;
  useCaseSummary: string;
  optInWorkflow: string;
  optInKeywords: string;
  optOutKeywords: string;
  helpKeywords: string;
  sampleMessages: string[];
}

export interface WorkspaceMessagingServiceState {
  desiredSendMode: TwilioSendMode;
  serviceSid: string | null;
  friendlyName: string | null;
  provisioningStatus: WorkspaceOnboardingStatus;
  attachedSenderPhoneNumbers: string[];
  supportedChannels: WorkspaceOnboardingChannel[];
  stickySenderEnabled: boolean;
  advancedOptOutEnabled: boolean;
  lastProvisionedAt: string | null;
  lastError: string | null;
}

export interface WorkspaceTwilioBootstrapState {
  status: WorkspaceOnboardingStatus;
  authMode: WorkspaceTwilioAuthMode;
  callbackBaseUrl: string | null;
  inboundVoiceUrl: string | null;
  inboundSmsUrl: string | null;
  statusCallbackUrl: string | null;
  createdResources: string[];
  featureFlags: string[];
  driftMessages: string[];
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface WorkspaceEmergencyAddressState {
  addressSid: string | null;
  customerName: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  status: WorkspaceEmergencyAddressStatus;
  validationError: string | null;
  lastValidatedAt: string | null;
}

export interface WorkspaceEmergencyVoiceState {
  status: WorkspaceOnboardingStatus;
  enabled: boolean;
  emergencyEligiblePhoneNumbers: string[];
  ineligibleCallerIds: string[];
  allowedCallerIdTypes: string[];
  complianceNotes: string;
  address: WorkspaceEmergencyAddressState;
  lastReviewedAt: string | null;
}

export interface WorkspaceA2POnboardingState {
  status: WorkspaceOnboardingStatus;
  brandSid: string | null;
  campaignSid: string | null;
  trustProductSid: string | null;
  customerProfileBundleSid: string | null;
  brandType: string | null;
  tcrId: string | null;
  rejectionReason: string | null;
  lastSubmittedAt: string | null;
  lastSyncedAt: string | null;
}

export interface WorkspaceRcsOnboardingState {
  status: WorkspaceOnboardingStatus;
  provider: string | null;
  agentId: string | null;
  senderId: string | null;
  regions: string[];
  prerequisites: string[];
  notes: string;
  lastSubmittedAt: string | null;
  lastSyncedAt: string | null;
}

export interface WorkspaceOnboardingReviewState {
  blockingIssues: string[];
  lastError: string | null;
  lastUpdatedAt: string | null;
}

export interface WorkspaceMessagingOnboardingState {
  version: number;
  status: WorkspaceOnboardingStatus;
  currentStep: string;
  selectedChannels: WorkspaceOnboardingChannel[];
  steps: WorkspaceOnboardingStepState[];
  businessProfile: WorkspaceMessagingBusinessProfile;
  messagingService: WorkspaceMessagingServiceState;
  subaccountBootstrap: WorkspaceTwilioBootstrapState;
  emergencyVoice: WorkspaceEmergencyVoiceState;
  a2p10dlc: WorkspaceA2POnboardingState;
  rcs: WorkspaceRcsOnboardingState;
  reviewState: WorkspaceOnboardingReviewState;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
}

export interface WorkspaceMessagingReadiness {
  shouldRedirectToOnboarding: boolean;
  shouldShowOnboardingBanner: boolean;
  messagingReady: boolean;
  voiceReady: boolean;
  legacyMode: boolean;
  sendMode: TwilioSendMode;
  messagingServiceSid: string | null;
  selectedChannels: WorkspaceOnboardingChannel[];
  currentStep: string;
  warnings: string[];
}

export type TwilioAccountData = (Partial<AccountInstance> & {
  sid?: string;
  authToken?: string;
  portalConfig?: WorkspaceTwilioOpsConfig | null;
  portalSync?: WorkspaceTwilioSyncSnapshot | null;
  onboarding?: WorkspaceMessagingOnboardingState | null;
}) | null;

export enum WorkspaceTableNames {
  Audience = "audiences",
  Campaign = "campaigns",
  Contact = "contacts",
}

export type WorkspaceData =
  | {
      created_at: string;
      id: string;
      name: string;
      owner: string | null;
      users: string[] | null;
    }[]
  | null;

type FeatureFlag = boolean;

type NestedFlags = {
  [key: string]: FeatureFlag | NestedFlags;
};

export type Flags = {
  [key: string]: NestedFlags;
};

export type ScheduleInterval = {
  start: string;
  end: string;
};

export type ScheduleDay = {
  active: boolean;
  intervals: ScheduleInterval[];
};

export type Schedule = {
  [key: string]: ScheduleDay | {
    start: string;
    end: string;
  };
};

export type Weekday =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type BlockOption = {
  next: string;
  value?: string;
  content?: string;
};

export type IVROption = {
  value: number | "vx-any";
  next: string;
  content?: string;
}

export type Block = {
  id: string;
  type: "radio" | "dropdown" | "boolean" | "multi" | "textarea" | "textblock" | "audio";
  title: string;
  content: string;
  options: BlockOption[] | IVROption[];
};

export type IVRBlock = Block & {
  audioFile: string;
  speechType: "recorded" | "synthetic";
  responseType: "dtmf" | "speech" | "dtmf speech" | null;
}

export type Page = {
  id: string;
  title: string;
  blocks: string[];
};

export type Flow = {
  type: "ivr" | "script";
  pages: {
    [key: string]: Page;
  };
  blocks: {
    [key: string]: Block;
  };
  startPage: string;
};

export interface DispositionResult {
  disposition: string;
  count: number;
  average_call_duration: string;
  average_wait_time: string;
  expected_total: number;
}

export interface ResultsScreenProps {
  totalCalls: number;
  results: DispositionResult[];
  expectedTotal: number;
  isBusy: boolean;
}

export interface CampaignDetails extends Tables<"live_campaign"> {
  script: Script;
}

export type CampaignState = {
  status: "idle" | "dialing" | "connected" | "completed" | "failed";
  contact_id?: string;
  disposition?: string;
};

export type LoaderData = {
  campaign: Campaign;
  attempts: OutreachAttempt[];
  user: NonNullable<User>;
  audiences: Audience[];
  campaignDetails: CampaignDetails;
  credits: number;
  workspaceId: string;
  queue: QueueItem[];
  contacts: Contact[];
  nextRecipient: QueueItem | null;
  initalCallsList: Call[];
  initialRecentCall: Call | null;
  initialRecentAttempt: OutreachAttempt | null;
  token: string;
  count: number;
  completed: number;
  isActive: boolean;
  hasAccess: boolean;
  verifiedNumbers: string[];
};

export interface CallAreaProps {
  conference: { parameters: { Sid: string } } | null;
  isBusy: boolean;
  predictive: boolean;
  nextRecipient: QueueItem | null;
  activeCall: ActiveCall;
  recentCall: Call | null;
  handleVoiceDrop: () => void;
  hangUp: () => void;
  displayState: string;
  dispositionOptions: string[];
  handleDialNext: () => void;
  handleDequeueNext: () => void;
  disposition: string;
  setDisposition: (disposition: string) => void;
  recentAttempt: OutreachAttempt | null;
  callState: string;
  callDuration: number;
  voiceDrop: boolean;
}

export interface CallQuestionnaireProps {
  isBusy: boolean;
  handleResponse: (response: { blockId: string; value: string | string[] }) => void;
  campaignDetails: CampaignDetails;
  update: Record<string, unknown>;
  nextRecipient: QueueItem | null;
  handleQuickSave: () => void;
  disabled: boolean;
}



export interface CampaignSchedule {
  start_date: string;
  end_date: string;
  schedule: {
    [key: string]: {
      active: boolean;
      intervals: { start: string; end: string; }[];
    };
  };
}

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface BaseUser {
  id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  organization: number | null;
  access_level: string | null;
  activity: Json;
  created_at: string;
  verified_audio_numbers: string[] | null;
}

export interface AppUser extends BaseUser {}

export interface CallParameters {
  CallSid: string;
  [key: string]: unknown;
}

export interface BaseCall {
  id: string;
  account_sid: string | null;
  answered_by: "human" | "machine" | "unknown" | null;
  answers: Json;
  api_version: string | null;
  call_duration: number | null;
  caller_name: string | null;
  campaign_id: number | null;
  contact_id: string | null;
  created_at: string;
  direction: string | null;
  duration: number | null;
  end_time: string | null;
  from: string | null;
  from_city: string | null;
  from_country: string | null;
  from_state: string | null;
  from_zip: string | null;
  parent_call_sid: string | null;
  price: number | null;
  price_unit: string | null;
  recording_sid: string | null;
  recording_status: string | null;
  recording_url: string | null;
  sid: string | null;
  start_time: string | null;
  status: string | null;
  to: string | null;
  to_city: string | null;
  to_country: string | null;
  to_state: string | null;
  to_zip: string | null;
  updated_at: string | null;
  uri: string | null;
  workspace: string | null;
  parameters?: CallParameters;
}



export interface ActiveCall extends Call {
  parameters: CallParameters;
  mute: (state: boolean) => void;
  _setInputTracksFromStream: (stream: MediaStream) => Promise<void>;
  sendDigits: (digits: string) => void;
}

export interface UseSupabaseRealtimeProps {
  user: AppUser;
  supabase: SupabaseClient<Database>;
  init: {
    predictiveQueue: QueueItem[];
    queue: QueueItem[];
    callsList: Call[];
    attempts: OutreachAttempt[];
    recentCall: Call | null;
    recentAttempt: OutreachAttempt | null;
    nextRecipient: QueueItem | null;
    credits: number;
  };
  campaign_id: string;
  activeCall: ActiveCall | null;
  setQuestionContact: (contact: QueueItem | null) => void;
  predictive: boolean;
  setCallDuration: (duration: number) => void;
  setUpdate: (update: Record<string, unknown> | null) => void;
}

// Utility function to generate survey links
export function generateSurveyLink(contactId: number, surveyId: string, baseUrl: string): string {
  const encoded = btoa(`${contactId}:${surveyId}`);
  return `${baseUrl}/?q=${encoded}`;
}
    