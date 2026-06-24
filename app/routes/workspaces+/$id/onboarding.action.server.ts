import {
  getUserRole,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { User } from "@/lib/types";
import type { ActionFunctionArgs } from "react-router";
import {
  isOnboardingActionName,
  type OnboardingActionData,
  type OnboardingActionName,
} from "@/lib/onboarding-actions.server";
import {
  runOnboardingAction,
  type OnboardingActionContext,
  type OnboardingHandlerResult,
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

function applyHandlerResult(
  workspaceId: string,
  headers: Headers,
  result: OnboardingHandlerResult,
): ReturnType<typeof routeData<OnboardingActionData>> | never {
  if (result.kind === "redirect") {
    redirectToOnboardingStep(workspaceId, result.step, headers, result.searchParams);
  }

  return routeData<OnboardingActionData>(result.data, {
    status: result.status ?? (result.data.error ? 400 : 200),
  });
}

async function runUiOnboardingAction(
  ctx: OnboardingActionContext & { headers: Headers },
  actionName: OnboardingActionName,
): Promise<ReturnType<typeof routeData<OnboardingActionData>> | never> {
  const outcome = await runOnboardingAction(
    ctx.supabaseClient,
    ctx.user.id,
    ctx.workspaceId,
    actionName,
    ctx.input,
  );

  if (!outcome.ok) {
    return routeData<OnboardingActionData>({ error: outcome.error }, { status: outcome.status });
  }

  return applyHandlerResult(ctx.workspaceId, ctx.headers, outcome.result);
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
  const actorUserId = user.id ?? null;

  await requireWorkspaceAccess({
    supabaseClient,
    user,
    workspaceId: wsId,
  });

  const role = (
    await getUserRole({
      supabaseClient,
      user: user as unknown as User,
      workspaceId: wsId,
    })
  )?.role;

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

  const ctx = {
    input: formData,
    workspaceId: wsId,
    headers,
    supabaseClient,
    user: { id: user.id },
    actorUserId,
  };

  try {
    return await runUiOnboardingAction(ctx, actionName);
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
