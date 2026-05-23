import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";
import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect } from "react-router";
import { Form, Link, useActionData, useFetcher, useLoaderData, useOutletContext } from "react-router";
import { User, WorkspaceNumbers } from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getUserRole, getWorkspacePhoneNumbers, getWorkspaceUsers, removeWorkspacePhoneNumber, requireWorkspaceAccess, updateCallerId, updateWorkspacePhoneNumber } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";

type ValidationRequest = {
  accountSid: string;
  callSid: string;
  friendlyName: string;
  phoneNumber: string;
  validationCode: string;
};

type NumberCapabilities = {
  fax: boolean;
  mms: boolean;
  sms: boolean;
  voice: boolean;
  verification_status: boolean;
};

type NumberRequest = Array<{
  id: bigint;
  created_at: string;
  workspace: string;
  friendly_name: string;
  phone_number: string;
  capabilities: NumberCapabilities;
}>;

type CallerIDResponse = {
  validationRequest: ValidationRequest;
  numberRequest: NumberRequest;
  error?: string;
};

interface FormData {
  formName: string;
  numberId?: string;
  incomingActivity?: string;
  incomingVoiceMessage?: string;
  callerId?: string;
  [key: string]: unknown;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {


  const { supabaseClient, headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return redirect("/signin");
  }
  const { data: users, error } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });
  const { data: phoneNumbers, error: numbersError } =
    await getWorkspacePhoneNumbers({ supabaseClient, workspaceId });
  const { data: workspace } = await supabaseClient
    .from("workspace")
    .select("credits")
    .eq("id", workspaceId)
    .single();
  const { data: mediaNames } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspaceId);
  if (user) {
    const userRole = await getUserRole({
      supabaseClient,
      user: user as unknown as User,
      workspaceId,
    });
    const hasAccess = userRole?.role !== MemberRole.Caller;
    if (!hasAccess) return redirect("..");
    return routeData(
      {
        phoneNumbers,
        workspaceId,
        mediaNames,
        users,
        creditsBalance: workspace?.credits ?? 0,
      },
      { headers },
    );
  }

  return routeData(
    {
      phoneNumbers,
      workspaceId,
      user,
      users,
      creditsBalance: workspace?.credits ?? 0,
    },
    { headers },
  );
}
