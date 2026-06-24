import {
  getUserRole,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";
import {
  isOnboardingActionName,
  type OnboardingActionData,
  type OnboardingActionName,
} from "@/lib/onboarding-actions.server";
import {
  mapOnboardingHandlerResult,
  runOnboardingAction,
} from "@/lib/platform-onboarding.server";

export type { OnboardingActionData } from "@/lib/onboarding-actions.server";

function redirectToOnboardingStep(
  workspaceId: string,
  step: string,
  headers: Headers,
  searchParams?: Record<string, string>,
): never {
  const params = new URLSearchParams({ step, ...searchParams });
  throw redirect(`/workspaces/${workspaceId}/onboarding?${params.toString()}`, { headers });
}

async function runUiOnboardingAction(
  workspaceId: string,
  headers: Headers,
  userId: string,
  supabaseClient: Awaited<ReturnType<typeof verifyAuth>>["supabaseClient"],
  actionName: OnboardingActionName,
  input: FormData,
): Promise<ReturnType<typeof routeData<OnboardingActionData>> | never> {
  const outcome = await runOnboardingAction(
    supabaseClient,
    userId,
    workspaceId,
    actionName,
    input,
  );

  if (!outcome.ok) {
    return routeData<OnboardingActionData>({ error: outcome.error }, { status: outcome.status });
  }

  const mapped = mapOnboardingHandlerResult(outcome.result, outcome.detail, "ui");
  if (mapped.kind === "ui_redirect") {
    redirectToOnboardingStep(
      workspaceId,
      mapped.step,
      headers,
      mapped.searchParams,
    );
  }

  if (mapped.kind !== "ui_payload") {
    return routeData<OnboardingActionData>(
      { error: "Unexpected onboarding response." },
      { status: 500 },
    );
  }

  return routeData<OnboardingActionData>(mapped.data, {
    status: mapped.status,
  });
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, user, headers } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin", { headers });
  }

  const wsId = params.id;
  if (!wsId) {
    return routeData<OnboardingActionData>({ error: "Workspace ID is required." }, { status: 400 });
  }

  await requireWorkspaceAccess({
    supabaseClient,
    user,
    workspaceId: wsId,
  });

  const role = (await getUserRole({ supabaseClient, user, workspaceId: wsId }))?.role;

  if (role !== "owner" && role !== "admin") {
    return routeData<OnboardingActionData>(
      { error: "Only workspace admins can change onboarding state." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const actionName = String(formData.get("_action") ?? "");

  if (!isOnboardingActionName(actionName)) {
    return routeData<OnboardingActionData>({ error: "Unknown onboarding action." }, { status: 400 });
  }

  try {
    return await runUiOnboardingAction(
      wsId,
      headers,
      user.id,
      supabaseClient,
      actionName,
      formData,
    );
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return routeData<OnboardingActionData>(
      {
        error: error instanceof Error ? error.message : "Onboarding update failed.",
      },
      { status: 500 },
    );
  }
};
