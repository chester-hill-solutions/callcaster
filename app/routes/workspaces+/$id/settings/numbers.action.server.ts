import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";
import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect } from "react-router";
import { Form, Link, useActionData, useFetcher, useLoaderData, useOutletContext } from "react-router";
import { User, WorkspaceNumbers } from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "react-router";
import { getUserRole, getWorkspacePhoneNumbers, getWorkspaceUsers, removeWorkspacePhoneNumber, requireWorkspaceAccess, updateCallerId, updateWorkspacePhoneNumber } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {


  const { supabaseClient, headers, user } = await verifyAuth(request);

  const data = Object.fromEntries(await request.formData()) as Record<
    string,
    FormDataEntryValue
  >;
  const formName = data.formName;
  const workspace_id = params.id;
  if (!workspace_id) return { error: "Workspace ID is required" };

  if (!user) {
    return { error: "Unauthorized" };
  }

  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: user.id },
    workspaceId: workspace_id,
  });

  const userRole = await getUserRole({
    supabaseClient,
    user: user as unknown as User,
    workspaceId: workspace_id,
  });
  if (userRole?.role === MemberRole.Caller) {
    return { error: "You do not have permission to update phone numbers" };
  }

  if (formName === "caller-id") {
    const { formName: _ignoredFormName, ...callerIdData } = data;
    const res = await fetch(`${process.env["BASE_URL"]}/api/caller-id`, {
      body: JSON.stringify({ ...callerIdData, workspace_id }),
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      method: "POST",
    });
    const { validationRequest, numberRequest }: CallerIDResponse =
      await res.json();
    return { validationRequest, numberRequest };
  } else if (formName === "remove-number") {
    const { formName: _ignoredFormName, ...removeNumberData } = data;
    const { error } = await removeWorkspacePhoneNumber({
      supabaseClient,
      numberId: BigInt(String(removeNumberData.numberId || "0")),
      workspaceId: workspace_id as string,
    });
    if (error) return { error };
    return null;
  } else if (formName === "update-incoming-activity") {
    const { numberId, incomingActivity } = data;
    const { error: incomingActivityError } = await updateWorkspacePhoneNumber({
      supabaseClient,
      numberId: numberId as string,
      workspaceId: workspace_id as string,
      updates: { inbound_action: incomingActivity as string },
    });
    if (incomingActivityError) return { error: incomingActivityError };
    return null;
  } else if (formName === "update-incoming-voice-message") {
    const { numberId: voiceNumberId, incomingVoiceMessage } = data;
    const { error: incomingVoiceMessageError } =
      await updateWorkspacePhoneNumber({
        supabaseClient,
        numberId: voiceNumberId as string,
        workspaceId: workspace_id as string,
        updates: { inbound_audio: incomingVoiceMessage as string },
      });
    if (incomingVoiceMessageError) return { error: incomingVoiceMessageError };
    return null;
  } else if (formName === "update-handset") {
    const { numberId, handsetEnabled } = data;
    const { error: handsetError } = await updateWorkspacePhoneNumber({
      supabaseClient,
      numberId: numberId as string,
      workspaceId: workspace_id as string,
      updates: { handset_enabled: handsetEnabled === "true" },
    });
    if (handsetError) return { error: handsetError };
    return null;
  } else if (formName === "update-caller-id") {
    const { numberId: voiceNumberId, friendly_name } = data;
    const { data: number, error: friendlyNameError } =
      await updateWorkspacePhoneNumber({
        supabaseClient,
        numberId: voiceNumberId as string,
        workspaceId: workspace_id as string,
        updates: { friendly_name: friendly_name as string },
      });
    if (friendlyNameError) return { error: friendlyNameError };
    const updateData = await updateCallerId({
      supabaseClient,
      workspaceId: workspace_id as string,
      number,
      friendly_name: friendly_name as string,
    });
    if (updateData?.error) return { error: updateData.error };
    return null;
  }
  return { error: "An unknown error occured" };
}
