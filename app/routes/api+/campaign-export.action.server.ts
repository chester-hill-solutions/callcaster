import { data as routeData, ActionFunctionArgs } from "react-router";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/lib/database.types";
import { CSV_DEFAULT_LINE_ENDING, CSV_UTF8_BOM, escapeCsvCell, type CsvCell } from "@/lib/csv";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomStr}`;
};



// Schedule periodic cleanu
// Define types for our data structures

interface Contact {
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

interface ContactWithPhonePatterns extends Contact {
  cleanPhone: string;
  cleanPhoneNoCountry: string;
  cleanPhoneWithCountry: string;
}

interface Message {
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

interface MessageWithContact extends Message {
  contact: ContactWithPhonePatterns;
  message_date: string;
}

interface Call {
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

interface AttemptWithDetails extends OutreachAttempt {
  contact: Contact;
  call: Call;
}

interface Campaign {
  id: number;
  title?: string;
  start_date: string;
  end_date: string;
  type?: string;
  status?: string;
}

interface ScriptBlock {
  id: string;
  type: string;
  title?: string;
}

interface ScriptStep {
  title?: string;
  blocks?: ScriptBlock[];
}

interface ScriptSteps {
  pages: {
    [key: string]: {
      id: string;
      title?: string;
      blocks: string[];
    };
  };
  blocks: {
    [key: string]: {
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
    };
  };
}

interface Script {
  id: number;
  name: string;
  type: string | null;
  steps: ScriptSteps;
  workspace: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

// Process message campaign export in chunks

const escapeExportCell = (value: unknown): string =>
  escapeCsvCell(value as CsvCell, { protectFromInjection: true });

export const action = async ({ request, params }: ActionFunctionArgs) => {



  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const formData = await request.formData();
    const campaignId = formData.get("campaignId");
    const workspaceId = formData.get("workspaceId");

    if (!campaignId || !workspaceId) {
      return new Response("Missing required parameters", { status: 400 });
    }

    // Defense-in-depth: ensure caller has access to the workspace they request.
    await requireWorkspaceAccess({
      supabaseClient,
      user,
      workspaceId: workspaceId.toString(),
    });

    // Ensure the campaign belongs to the workspace.
    const { data: campaignRow, error: campaignRowError } = await supabaseClient
      .from("campaign")
      .select("id, type, title, workspace")
      .eq("id", Number(campaignId))
      .single();
    if (campaignRowError || !campaignRow) {
      return new Response("Campaign not found", { status: 404 });
    }
    if (campaignRow.workspace !== workspaceId.toString()) {
      return new Response("Forbidden", { status: 403 });
    }

    // Generate a unique ID for this export
    const exportId = generateUniqueId();

    // Start the export process asynchronously based on campaign type
    if (campaignRow.type === "message") {
      processMessageCampaignExport(
        supabaseClient,
        Number(campaignId),
        workspaceId.toString(),
        exportId,
        campaignRow.title || ''
      );
    } else if (campaignRow.type === "live_call" || campaignRow.type === "robocall") {
      processCallCampaignExport(
        supabaseClient,
        Number(campaignId),
        workspaceId.toString(),
        exportId,
        campaignRow.title || ''
      );
    } else {
      return new Response("Invalid campaign type", { status: 400 });
    }

    // Return the export ID immediately
    return routeData({
      exportId,
      status: "started",
      statusUrl: `/api/campaign-export-status?exportId=${exportId}&workspaceId=${workspaceId}`
    });
  } catch (error) {
    logger.error("Export request error:", error);
    return routeData({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}
