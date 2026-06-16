import {
  getConversationParticipantPhones,
  getChatSortOption,
  isInboundMessageDirection,
  normalizeConversationPhone,
  sortConversationSummaries,
  type ConversationSummary,
} from "@/lib/chat-conversation-sort";
import {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import { data as routeData, redirect } from "react-router";
import { formatMessageTimestamp, normalizePhoneNumber } from "@/lib/utils";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { isOptOutMessage, parseOptOutKeywords } from "@/lib/chat-opt-out";
import { sendMessage } from "@/lib/chat-sms.server";
import { verifyAuth } from "@/lib/supabase.server";
import type {
  User,
  Contact,
  Workspace,
  BaseUser,
  WorkspaceNumber,
} from "@/lib/types";
import type { ActionFunctionArgs } from "react-router";
import type { Database, Tables } from "@/lib/database.types";

export async function action({ request, params }: ActionFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params["id"];
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const contact_number = normalizePhoneNumber(
    params["contact_number"] || (data["contact_number"] as string),
  );

  const responseData = await sendMessage({
    body: data["body"] as string,
    to: contact_number as string,
    from: data["from"] as string,
    media: data["media"] as string,
    supabase: supabaseClient,
    workspace: workspaceId as string,
    contact_id: data.contact_id as string,
    user: user as unknown as BaseUser,
  });
  if (!params.contact_number) return redirect(contact_number);
  return routeData({ responseData });
}
