import type { Database, Tables } from "@/lib/database.types";
import type {
  User,
  Contact,
  Workspace,
  BaseUser,
  WorkspaceNumber,
} from "@/lib/types";
import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect } from "react-router";
import { NavLink, Outlet, useFetcher, useLoaderData, useLocation, useNavigate, useOutlet, useOutletContext, useParams, useSearchParams, useRouteError } from "react-router";
import { MdAdd, MdChat } from "react-icons/md";
import { isOptOutMessage, parseOptOutKeywords } from "@/lib/chat-opt-out";
import { formatMessageTimestamp, normalizePhoneNumber } from "@/lib/utils";
import { useInfiniteScroll } from "@/hooks";
import { X } from "lucide-react";
import {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import {
  getConversationParticipantPhones,
  getChatSortOption,
  isInboundMessageDirection,
  normalizeConversationPhone,
  sortConversationSummaries,
  type ConversationSummary,
} from "@/lib/chat-conversation-sort";
import { data as routeData, redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { verifyAuth } from "@/lib/supabase.server";
import { sendMessage } from "@/routes/api+/chat_sms.send.server";

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
