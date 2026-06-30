// Drizzle-inferred database types — replaces app/lib/database.types.ts (Track 2)
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  agent_state,
  answered_by,
  call_status,
  campaign_phase,
  campaign_status,
  campaign_type,
  dial_types,
  message_direction,
  message_status,
  queue_entry_state,
  queue_status,
  voter_list_source,
  workspace_role,
  workspace,
  workspace_users,
  workspace_api_key,
  workspace_invite,
  workspace_number,
  campaign,
  campaign_audience,
  campaign_queue,
  script,
  contact,
  contact_audience,
  audience,
  audience_upload,
  households,
  call,
  message,
  outreach_attempt,
  inbound_queue,
  inbound_queue_member,
  inbound_queue_entry,
  agent_status,
  agent_status_event,
  handset_session,
  transaction_history,
  survey,
  survey_page,
  survey_question,
  question_option,
  survey_response,
  response_answer,
  verification_session,
  user,
  webhook,
} from "@/db/schema";

/** JSON column / RPC payload alias (Postgres-compatible). */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─── Enum value types (from Drizzle pgEnum) ───────────────────────────────

export type AgentState = (typeof agent_state.enumValues)[number];
export type AnsweredBy = (typeof answered_by.enumValues)[number];
export type CallStatus = (typeof call_status.enumValues)[number];
export type CampaignPhase = (typeof campaign_phase.enumValues)[number];
export type CampaignStatus = (typeof campaign_status.enumValues)[number];
export type CampaignType = (typeof campaign_type.enumValues)[number];
export type DialTypes = (typeof dial_types.enumValues)[number];
export type MessageDirection = (typeof message_direction.enumValues)[number];
export type MessageStatus = (typeof message_status.enumValues)[number];
export type QueueEntryState = (typeof queue_entry_state.enumValues)[number];
export type QueueStatus = (typeof queue_status.enumValues)[number];
export type VoterListSource = (typeof voter_list_source.enumValues)[number];
export type WorkspaceRole = (typeof workspace_role.enumValues)[number];

/** Workspace permission strings (not yet modeled as pgEnum in Drizzle schema). */
export const WORKSPACE_PERMISSION_VALUES = [
  "workspace.delete",
  "workspace.addUser",
  "workspace.removeUser",
  "workspace.call",
  "workspace.addCampaign",
  "workspace.addAudience",
  "workspace.addContact",
  "workspace.editUser",
  "workspace.editCampaign",
  "workspace.startCampaign",
  "workspace.stopCampaign",
  "workspace.removeCampaign",
  "workspace.inviteCaller",
  "workspace.manageCredits",
  "workspace.pauseCampaign",
  "workspace.editContact",
  "workspace.removeContact",
  "workspace.editAudience",
  "workspace.removeAudience",
  "workspace.transferOwnership",
  "workspace.removeCaller",
  "workspace.initializeMedia",
  "workspace.addMedia",
  "workspace.removeMedia",
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSION_VALUES)[number];

// ─── Table row / insert types (Drizzle $inferSelect / $inferInsert) ───────

export type WorkspaceRow = InferSelectModel<typeof workspace>;
export type WorkspaceInsert = InferInsertModel<typeof workspace>;
export type WorkspaceUpdate = Partial<WorkspaceInsert>;

export type WorkspaceUsersRow = InferSelectModel<typeof workspace_users>;
export type WorkspaceUsersInsert = InferInsertModel<typeof workspace_users>;
export type WorkspaceUsersUpdate = Partial<WorkspaceUsersInsert>;

export type WorkspaceApiKeyRow = InferSelectModel<typeof workspace_api_key>;
export type WorkspaceApiKeyInsert = InferInsertModel<typeof workspace_api_key>;
export type WorkspaceApiKeyUpdate = Partial<WorkspaceApiKeyInsert>;

export type WorkspaceInviteRow = InferSelectModel<typeof workspace_invite>;
export type WorkspaceInviteInsert = InferInsertModel<typeof workspace_invite>;
export type WorkspaceInviteUpdate = Partial<WorkspaceInviteInsert>;

export type WorkspaceNumberRow = InferSelectModel<typeof workspace_number>;
export type WorkspaceNumberInsert = InferInsertModel<typeof workspace_number>;
export type WorkspaceNumberUpdate = Partial<WorkspaceNumberInsert>;

export type CampaignRow = InferSelectModel<typeof campaign>;
export type CampaignInsert = InferInsertModel<typeof campaign>;
export type CampaignUpdate = Partial<CampaignInsert>;

export type CampaignAudienceRow = InferSelectModel<typeof campaign_audience>;
export type CampaignAudienceInsert = InferInsertModel<typeof campaign_audience>;
export type CampaignAudienceUpdate = Partial<CampaignAudienceInsert>;

export type CampaignQueueRow = InferSelectModel<typeof campaign_queue>;
export type CampaignQueueInsert = InferInsertModel<typeof campaign_queue>;
export type CampaignQueueUpdate = Partial<CampaignQueueInsert>;

export type ScriptRow = InferSelectModel<typeof script>;
export type ScriptInsert = InferInsertModel<typeof script>;
export type ScriptUpdate = Partial<ScriptInsert>;

export type ContactRow = InferSelectModel<typeof contact>;
export type ContactInsert = InferInsertModel<typeof contact>;
export type ContactUpdate = Partial<ContactInsert>;

export type ContactAudienceRow = InferSelectModel<typeof contact_audience>;
export type ContactAudienceInsert = InferInsertModel<typeof contact_audience>;
export type ContactAudienceUpdate = Partial<ContactAudienceInsert>;

export type AudienceRow = InferSelectModel<typeof audience>;
export type AudienceInsert = InferInsertModel<typeof audience>;
export type AudienceUpdate = Partial<AudienceInsert>;

export type AudienceUploadRow = InferSelectModel<typeof audience_upload>;
export type AudienceUploadInsert = InferInsertModel<typeof audience_upload>;
export type AudienceUploadUpdate = Partial<AudienceUploadInsert>;

export type HouseholdsRow = InferSelectModel<typeof households>;
export type HouseholdsInsert = InferInsertModel<typeof households>;
export type HouseholdsUpdate = Partial<HouseholdsInsert>;

export type CallRow = InferSelectModel<typeof call>;
export type CallInsert = InferInsertModel<typeof call>;
export type CallUpdate = Partial<CallInsert>;

export type MessageRow = InferSelectModel<typeof message>;
export type MessageInsert = InferInsertModel<typeof message>;
export type MessageUpdate = Partial<MessageInsert>;

export type OutreachAttemptRow = InferSelectModel<typeof outreach_attempt>;
export type OutreachAttemptInsert = InferInsertModel<typeof outreach_attempt>;
export type OutreachAttemptUpdate = Partial<OutreachAttemptInsert>;

export type InboundQueueRow = InferSelectModel<typeof inbound_queue>;
export type InboundQueueInsert = InferInsertModel<typeof inbound_queue>;
export type InboundQueueUpdate = Partial<InboundQueueInsert>;

export type InboundQueueMemberRow = InferSelectModel<typeof inbound_queue_member>;
export type InboundQueueMemberInsert = InferInsertModel<typeof inbound_queue_member>;
export type InboundQueueMemberUpdate = Partial<InboundQueueMemberInsert>;

export type InboundQueueEntryRow = InferSelectModel<typeof inbound_queue_entry>;
export type InboundQueueEntryInsert = InferInsertModel<typeof inbound_queue_entry>;
export type InboundQueueEntryUpdate = Partial<InboundQueueEntryInsert>;

export type AgentStatusRow = InferSelectModel<typeof agent_status>;
export type AgentStatusInsert = InferInsertModel<typeof agent_status>;
export type AgentStatusUpdate = Partial<AgentStatusInsert>;

export type AgentStatusEventRow = InferSelectModel<typeof agent_status_event>;
export type AgentStatusEventInsert = InferInsertModel<typeof agent_status_event>;
export type AgentStatusEventUpdate = Partial<AgentStatusEventInsert>;

export type HandsetSessionRow = InferSelectModel<typeof handset_session>;
export type HandsetSessionInsert = InferInsertModel<typeof handset_session>;
export type HandsetSessionUpdate = Partial<HandsetSessionInsert>;

export type TransactionHistoryRow = InferSelectModel<typeof transaction_history>;
export type TransactionHistoryInsert = InferInsertModel<typeof transaction_history>;
export type TransactionHistoryUpdate = Partial<TransactionHistoryInsert>;

export type SurveyRow = InferSelectModel<typeof survey>;
export type SurveyInsert = InferInsertModel<typeof survey>;
export type SurveyUpdate = Partial<SurveyInsert>;

export type SurveyPageRow = InferSelectModel<typeof survey_page>;
export type SurveyPageInsert = InferInsertModel<typeof survey_page>;
export type SurveyPageUpdate = Partial<SurveyPageInsert>;

export type SurveyQuestionRow = InferSelectModel<typeof survey_question>;
export type SurveyQuestionInsert = InferInsertModel<typeof survey_question>;
export type SurveyQuestionUpdate = Partial<SurveyQuestionInsert>;

export type QuestionOptionRow = InferSelectModel<typeof question_option>;
export type QuestionOptionInsert = InferInsertModel<typeof question_option>;
export type QuestionOptionUpdate = Partial<QuestionOptionInsert>;

export type SurveyResponseRow = InferSelectModel<typeof survey_response>;
export type SurveyResponseInsert = InferInsertModel<typeof survey_response>;
export type SurveyResponseUpdate = Partial<SurveyResponseInsert>;

export type ResponseAnswerRow = InferSelectModel<typeof response_answer>;
export type ResponseAnswerInsert = InferInsertModel<typeof response_answer>;
export type ResponseAnswerUpdate = Partial<ResponseAnswerInsert>;

export type VerificationSessionRow = InferSelectModel<typeof verification_session>;
export type VerificationSessionInsert = InferInsertModel<typeof verification_session>;
export type VerificationSessionUpdate = Partial<VerificationSessionInsert>;

export type UserRow = InferSelectModel<typeof user>;
export type UserInsert = InferInsertModel<typeof user>;
export type UserUpdate = Partial<UserInsert>;

export type WebhookRow = InferSelectModel<typeof webhook>;
export type WebhookInsert = InferInsertModel<typeof webhook>;
export type WebhookUpdate = Partial<WebhookInsert>;

// ─── Campaign subtype views (Postgres views — hand-maintained) ───────────

export type LiveCampaignRow = {
  campaign_id: number | null;
  created_at: string;
  disposition_options: Json;
  id: number;
  questions: Json;
  script_id: number | null;
  voicedrop_audio: string | null;
  workspace: string;
};

export type LiveCampaignInsert = {
  campaign_id?: number | null;
  created_at?: string;
  disposition_options?: Json;
  id?: number;
  questions?: Json;
  script_id?: number | null;
  voicedrop_audio?: string | null;
  workspace?: string;
};

export type LiveCampaignUpdate = Partial<LiveCampaignInsert>;

export type IvrCampaignRow = {
  campaign_id: number;
  created_at: string;
  id: number;
  script_id: number | null;
  workspace: string;
};

export type IvrCampaignInsert = {
  campaign_id: number;
  created_at?: string;
  id?: number;
  script_id?: number | null;
  workspace: string;
};

export type IvrCampaignUpdate = Partial<IvrCampaignInsert>;

export type MessageCampaignRow = {
  body_text: string | null;
  campaign_id: number | null;
  created_at: string;
  id: number;
  message_media: string[] | null;
  workspace: string;
};

export type MessageCampaignInsert = {
  body_text?: string | null;
  campaign_id?: number | null;
  created_at?: string;
  id?: number;
  message_media?: string[] | null;
  workspace: string;
};

export type MessageCampaignUpdate = Partial<MessageCampaignInsert>;

// ─── RPC / composite helpers ──────────────────────────────────────────────

export type ConversationSummaryRpcRow = {
  contact_phone: string;
  user_phone: string;
  conversation_start: string;
  conversation_last_update: string;
  message_count: number;
  unread_count: number;
  contact_firstname: string;
  contact_surname: string;
};

export type FindContactByPhoneRow = {
  address: string | null;
  address_id: string | null;
  carrier: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
  created_by: string | null;
  date_updated: string | null;
  email: string | null;
  external_id: string | null;
  firstname: string | null;
  id: number;
  opt_out: boolean | null;
  other_data: Json[];
  phone: string | null;
  postal: string | null;
  province: string | null;
  surname: string | null;
  workspace: string | null;
};

export type Campaigndata = {
  campaign_id: number | null;
  audience_id: number | null;
  contact_id: number | null;
  firstname: string | null;
  surname: string | null;
};

// ─── Common entity aliases (match app/lib/types.ts naming) ────────────────

export type Audience = AudienceRow;
export type Campaign = CampaignRow;
export type Contact = ContactRow;
export type Message = MessageRow;
export type OutreachAttempt = OutreachAttemptRow;
export type Script = ScriptRow;
export type Call = CallRow;
export type User = UserRow;
export type Workspace = WorkspaceRow;
export type WorkspaceNumber = WorkspaceNumberRow;
export type WorkspaceInvite = WorkspaceInviteRow;
export type LiveCampaign = LiveCampaignRow;
export type IVRCampaign = IvrCampaignRow;
export type MessageCampaign = MessageCampaignRow;

// ─── Postgres-compatible Database shape (for remaining never<T>) ─

type DbTableDef<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type PublicTables = {
  workspace: DbTableDef<WorkspaceRow, WorkspaceInsert, WorkspaceUpdate>;
  workspace_users: DbTableDef<WorkspaceUsersRow, WorkspaceUsersInsert, WorkspaceUsersUpdate>;
  workspace_api_key: DbTableDef<WorkspaceApiKeyRow, WorkspaceApiKeyInsert, WorkspaceApiKeyUpdate>;
  workspace_invite: DbTableDef<WorkspaceInviteRow, WorkspaceInviteInsert, WorkspaceInviteUpdate>;
  workspace_number: DbTableDef<WorkspaceNumberRow, WorkspaceNumberInsert, WorkspaceNumberUpdate>;
  campaign: DbTableDef<CampaignRow, CampaignInsert, CampaignUpdate>;
  campaign_audience: DbTableDef<CampaignAudienceRow, CampaignAudienceInsert, CampaignAudienceUpdate>;
  campaign_queue: DbTableDef<CampaignQueueRow, CampaignQueueInsert, CampaignQueueUpdate>;
  script: DbTableDef<ScriptRow, ScriptInsert, ScriptUpdate>;
  contact: DbTableDef<ContactRow, ContactInsert, ContactUpdate>;
  contact_audience: DbTableDef<ContactAudienceRow, ContactAudienceInsert, ContactAudienceUpdate>;
  audience: DbTableDef<AudienceRow, AudienceInsert, AudienceUpdate>;
  audience_upload: DbTableDef<AudienceUploadRow, AudienceUploadInsert, AudienceUploadUpdate>;
  households: DbTableDef<HouseholdsRow, HouseholdsInsert, HouseholdsUpdate>;
  call: DbTableDef<CallRow, CallInsert, CallUpdate>;
  message: DbTableDef<MessageRow, MessageInsert, MessageUpdate>;
  outreach_attempt: DbTableDef<OutreachAttemptRow, OutreachAttemptInsert, OutreachAttemptUpdate>;
  inbound_queue: DbTableDef<InboundQueueRow, InboundQueueInsert, InboundQueueUpdate>;
  inbound_queue_member: DbTableDef<InboundQueueMemberRow, InboundQueueMemberInsert, InboundQueueMemberUpdate>;
  inbound_queue_entry: DbTableDef<InboundQueueEntryRow, InboundQueueEntryInsert, InboundQueueEntryUpdate>;
  agent_status: DbTableDef<AgentStatusRow, AgentStatusInsert, AgentStatusUpdate>;
  agent_status_event: DbTableDef<AgentStatusEventRow, AgentStatusEventInsert, AgentStatusEventUpdate>;
  handset_session: DbTableDef<HandsetSessionRow, HandsetSessionInsert, HandsetSessionUpdate>;
  transaction_history: DbTableDef<TransactionHistoryRow, TransactionHistoryInsert, TransactionHistoryUpdate>;
  survey: DbTableDef<SurveyRow, SurveyInsert, SurveyUpdate>;
  survey_page: DbTableDef<SurveyPageRow, SurveyPageInsert, SurveyPageUpdate>;
  survey_question: DbTableDef<SurveyQuestionRow, SurveyQuestionInsert, SurveyQuestionUpdate>;
  question_option: DbTableDef<QuestionOptionRow, QuestionOptionInsert, QuestionOptionUpdate>;
  survey_response: DbTableDef<SurveyResponseRow, SurveyResponseInsert, SurveyResponseUpdate>;
  response_answer: DbTableDef<ResponseAnswerRow, ResponseAnswerInsert, ResponseAnswerUpdate>;
  verification_session: DbTableDef<VerificationSessionRow, VerificationSessionInsert, VerificationSessionUpdate>;
  user: DbTableDef<UserRow, UserInsert, UserUpdate>;
  webhook: DbTableDef<WebhookRow, WebhookInsert, WebhookUpdate>;
  live_campaign: DbTableDef<LiveCampaignRow, LiveCampaignInsert, LiveCampaignUpdate>;
  ivr_campaign: DbTableDef<IvrCampaignRow, IvrCampaignInsert, IvrCampaignUpdate>;
  message_campaign: DbTableDef<MessageCampaignRow, MessageCampaignInsert, MessageCampaignUpdate>;
};

type PublicEnums = {
  agent_state: AgentState;
  answered_by: AnsweredBy;
  call_status: CallStatus;
  campaign_phase: CampaignPhase;
  campaign_status: CampaignStatus;
  campaign_type: CampaignType;
  dial_types: DialTypes;
  message_direction: MessageDirection;
  message_status: MessageStatus;
  queue_entry_state: QueueEntryState;
  queue_status: QueueStatus;
  voter_list_source: VoterListSource;
  workspace_role: WorkspaceRole;
  workspace_permission: WorkspacePermission;
};

export type Database = {
  public: {
    Tables: PublicTables;
    Views: Record<string, never>;
    Functions: {
      get_conversation_summary: {
        Args: { p_workspace: string };
        Returns: ConversationSummaryRpcRow[];
      };
      find_contact_by_phone: {
        Args: { p_phone_number: string; p_workspace_id: string };
        Returns: FindContactByPhoneRow[];
      };
    };
    Enums: PublicEnums;
    CompositeTypes: {
      campaigndata: Campaigndata;
    };
  };
};

type PublicSchema = Database["public"];

/** Select a table row type by name (Postgres `Tables<T>` compatible). */
export type Tables<
  PublicTableName extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][PublicTableName]["Row"];

/** Insert shape for a table (Postgres `TablesInsert<T>` compatible). */
export type TablesInsert<
  PublicTableName extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][PublicTableName]["Insert"];

/** Update shape for a table (Postgres `TablesUpdate<T>` compatible). */
export type TablesUpdate<
  PublicTableName extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][PublicTableName]["Update"];

/** Enum union by name (Postgres `Enums<T>` compatible). */
export type Enums<
  PublicEnumName extends keyof PublicSchema["Enums"],
> = PublicSchema["Enums"][PublicEnumName];

/** Composite type by name. */
export type CompositeTypes<
  PublicCompositeTypeName extends keyof PublicSchema["CompositeTypes"],
> = PublicSchema["CompositeTypes"][PublicCompositeTypeName];
