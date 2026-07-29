import { hasMinRole, workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import {
  isOnboardingActionName,
  type OnboardingActionData,
  type OnboardingActionName,
} from "@/lib/onboarding-actions.server";
import {
  mapOnboardingHandlerResult,
  runOnboardingAction,
} from "@/lib/platform-onboarding.server";
import { MemberRole } from "@/lib/member-role";
import { defineAction } from "@/lib/handler.server";

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

function redirectToWorkspacePath(
  path: string,
  headers: Headers,
  searchParams?: Record<string, string>,
): never {
  if (!searchParams || Object.keys(searchParams).length === 0) {
    throw redirect(path, { headers });
  }
  // Merge flash params into any query already present on `path` (e.g. ?step=).
  const url = new URL(path, "http://local.invalid");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  throw redirect(`${url.pathname}${url.search}`, { headers });
}

async function runUiOnboardingAction(
  workspaceId: string,
  headers: Headers,
  userId: string,
  actionName: OnboardingActionName,
  input: FormData,
): Promise<ReturnType<typeof routeData<OnboardingActionData>> | never> {
  const outcome = await runOnboardingAction(userId,
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
  if (mapped.kind === "ui_redirect_path") {
    redirectToWorkspacePath(mapped.path, headers, mapped.searchParams);
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

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, params, auth }) => {
    const { headers, user, userRole } = auth;
    const wsId = params.id;
    if (!wsId) {
      return routeData<OnboardingActionData>({ error: "Workspace ID is required." }, { status: 400 });
    }

    if (!hasMinRole(userRole, MemberRole.Member)) {
      return routeData<OnboardingActionData>({ error: "Not authorized" }, { headers, status: 403 });
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
  },
});
