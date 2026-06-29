import {
  deleteWorkspaceNumber,
  patchWorkspaceNumber,
  verifyWorkspaceCallerId,
} from "@/lib/platform-workspace-numbers.server";
import { getUserRole, requireWorkspaceAccess } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { normalizeInboundRingCount } from "../../../../../shared/inbound-rings";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, user } = await verifyAuth(request);

  const data = Object.fromEntries(await request.formData()) as Record<
    string,
    FormDataEntryValue
  >;
  const formName = data.formName;
  const workspace_id = params.id;
  if (!workspace_id) return { error: "Workspace ID is required" };

  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: user.id },
    workspaceId: workspace_id,
  });

  const userRole = await getUserRole({
    supabaseClient,
    user: { id: user.id },
    workspaceId: workspace_id,
  });
  if (userRole?.role === MemberRole.Caller) {
    return { error: "You do not have permission to update phone numbers" };
  }

  if (formName === "caller-id") {
    const friendlyName = String(data.friendlyName ?? data.friendly_name ?? "");
    const phoneNumber = String(data.phoneNumber ?? data.phone_number ?? "");
    const result = await verifyWorkspaceCallerId(
      supabaseClient,
      user.id,
      workspace_id,
      phoneNumber,
      friendlyName,
    );
    if (!result.ok) return { error: result.error };
    return {
      validationRequest: result.validationRequest,
      numberRequest: result.numberRequest,
    };
  }

  if (formName === "remove-number") {
    const numberId = String(data.numberId || "0");
    const result = await deleteWorkspaceNumber(
      supabaseClient,
      user.id,
      workspace_id,
      numberId,
    );
    if (!result.ok) return { error: result.error };
    return null;
  }

  if (formName === "update-incoming-activity") {
    const result = await patchWorkspaceNumber(
      supabaseClient,
      user.id,
      workspace_id,
      String(data.numberId),
      { inbound_action: String(data.incomingActivity) },
    );
    if (!result.ok) return { error: result.error };
    return null;
  }

  if (formName === "update-incoming-voice-message") {
    const result = await patchWorkspaceNumber(
      supabaseClient,
      user.id,
      workspace_id,
      String(data.numberId),
      { inbound_audio: String(data.incomingVoiceMessage) },
    );
    if (!result.ok) return { error: result.error };
    return null;
  }

  if (formName === "update-inbound-ring-count") {
    const result = await patchWorkspaceNumber(
      supabaseClient,
      user.id,
      workspace_id,
      String(data.numberId),
      { inbound_ring_count: normalizeInboundRingCount(data.inboundRingCount) },
    );
    if (!result.ok) return { error: result.error };
    return null;
  }

  if (formName === "update-inbound-queue") {
    const inboundQueueId = data.inboundQueueId;
    const result = await patchWorkspaceNumber(
      supabaseClient,
      user.id,
      workspace_id,
      String(data.numberId),
      {
        inbound_queue_id: inboundQueueId ? Number(inboundQueueId) : null,
      },
    );
    if (!result.ok) return { error: result.error };
    return null;
  }

  if (formName === "update-inbound-script") {
    const inboundScriptId = data.inboundScriptId;
    const result = await patchWorkspaceNumber(
      supabaseClient,
      user.id,
      workspace_id,
      String(data.numberId),
      {
        inbound_script_id: inboundScriptId ? Number(inboundScriptId) : null,
      },
    );
    if (!result.ok) return { error: result.error };
    return null;
  }

  if (formName === "update-handset") {
    const result = await patchWorkspaceNumber(
      supabaseClient,
      user.id,
      workspace_id,
      String(data.numberId),
      { handset_enabled: data.handsetEnabled === "true" },
    );
    if (!result.ok) return { error: result.error };
    return null;
  }

  if (formName === "update-caller-id") {
    const result = await patchWorkspaceNumber(
      supabaseClient,
      user.id,
      workspace_id,
      String(data.numberId),
      { friendly_name: String(data.friendly_name) },
    );
    if (!result.ok) return { error: result.error };
    return null;
  }

  return { error: "An unknown error occured" };
};
