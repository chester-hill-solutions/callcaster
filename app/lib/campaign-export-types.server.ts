export interface ExportContact {
  id: number | string;
  firstname?: string | null;
  surname?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  opt_out?: boolean | null;
  created_at?: string | null;
  workspace?: string | null;
  external_id?: string | null;
  address_id?: string | null;
  postal?: string | null;
  carrier?: string | null;
  province?: string | null;
  country?: string | null;
  created_by?: string | null;
  date_updated?: string | null;
  other_data?: unknown;
}

export interface ExportContactWithPhonePatterns extends ExportContact {
  cleanPhone: string;
  cleanPhoneNoCountry: string;
  cleanPhoneWithCountry: string;
}

export interface ExportMessage {
  id: string;
  body?: string;
  campaign_id?: number | null;
  from?: string;
  to?: string;
  direction?: string;
  status?: string;
  date_sent?: string;
  date_created?: string;
  workspace?: string;
}

export interface ExportMessageWithContact extends ExportMessage {
  contact: ExportContactWithPhonePatterns;
  message_date: string;
}

export interface ExportCall {
  id?: string | null;
  sid?: string | null;
  duration?: string | null;
  status?: string | null;
  answered_by?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  outreach_attempt_id?: string | number | null;
  parent_call_sid?: string | null;
}

export interface ExportOutreachAttempt {
  id: number | string;
  contact_id: number | string;
  campaign_id: number;
  disposition?: string | null;
  result?: Record<string, unknown> | string | null;
  created_at?: string | null;
}

export interface ExportAttemptWithDetails extends ExportOutreachAttempt {
  contact: ExportContact;
  call: ExportCall;
}

export interface ExportCampaign {
  id: number;
  title?: string;
  start_date: string;
  end_date: string;
  type?: string;
  status?: string;
}

export interface ExportScript {
  id: number;
  name: string;
  type: string | null;
  steps: ExportScriptSteps;
  workspace: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface ExportScriptSteps {
  pages: Record<
    string,
    {
      id: string;
      title?: string;
      blocks: string[];
    }
  >;
  blocks: Record<
    string,
    {
      id: string;
      type: string;
      title?: string;
      content?: string;
      options?: Array<{
        next: string;
        value: string;
        content: string;
      }>;
      audioFile?: string;
      responseType?: string;
    }
  >;
}
