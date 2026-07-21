import {
  getUserRole,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import {
  isWizardOnboardingStepId,
} from "@/lib/messaging-onboarding.server";
import {
  asWorkspaceOnboardingStatus,
  isOnboardingActionName,
  type OnboardingActionData,
} from "@/lib/onboarding-actions.server";
import { persistWorkspaceOnboardingState } from "@/lib/onboarding/onboarding-persist.server";
import { stripDisabledRcsChannel } from "@/lib/rcs-onboarding.server";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import {
  loadWorkspaceOnboardingView,
  type OnboardingActionContext,
  type OnboardingHandlerResult,
  type WorkspaceOnboardingDetail,
} from "@/lib/platform-onboarding-helpers.server";
import { ONBOARDING_ACTION_HANDLERS } from "@/lib/platform-onboarding-handlers.server";

export type {
  OnboardingActionContext,
  OnboardingHandlerResult,
  WorkspaceOnboardingDetail,
} from "@/lib/platform-onboarding-helpers.server";
export { resolveOnboardingInput } from "@/lib/platform-onboarding-helpers.server";

export async function requireOnboardingAdmin(
  userId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const role = (
    await getUserRole({
      user: { id: userId },
      workspaceId,
    })
  )?.role;

  if (role !== "owner" && role !== "admin") {
    return {
      ok: false,
      error: "Only workspace admins can change onboarding state.",
      status: 403,
    };
  }

  return { ok: true };
}

export async function getWorkspaceOnboardingDetail(
  userId: string,
  workspaceId: string,
): Promise<
  | { ok: true; detail: WorkspaceOnboardingDetail }
  | { ok: false; error: string; status: number }
> {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const view = await loadWorkspaceOnboardingView(workspaceId);

  return {
    ok: true,
    detail: {
      onboarding: view.onboarding,
      readiness: view.readiness,
      a2p_blocking_issues: view.a2pBlockingIssues,
      rcs_blocking_issues: view.rcsBlockingIssues,
      phone_numbers: view.phoneNumbers,
      credits_balance: view.creditsBalance,
    },
  };
}

export async function patchWorkspaceOnboarding(
  userId: string,
  workspaceId: string,
  updates: {
    current_step?: string;
    selected_channels?: Array<
      "a2p10dlc" | "rcs" | "voice_compliance" | "toll_free_bulk_sms" | "local_number"
    >;
    status?: ReturnType<typeof asWorkspaceOnboardingStatus>;
  },
): Promise<
  | { ok: true; detail: WorkspaceOnboardingDetail }
  | { ok: false; error: string; status: number }
> {
  const admin = await requireOnboardingAdmin(userId, workspaceId);
  if (!admin.ok) {
    return admin;
  }

  const persistUpdates: Partial<WorkspaceMessagingOnboardingState> = {};

  if (updates.current_step !== undefined) {
    if (!isWizardOnboardingStepId(updates.current_step)) {
      return { ok: false, error: "Invalid onboarding step.", status: 400 };
    }
    persistUpdates.currentStep = updates.current_step;
  }

  if (updates.selected_channels !== undefined) {
    persistUpdates.selectedChannels = stripDisabledRcsChannel(updates.selected_channels);
  }

  if (updates.status !== undefined) {
    persistUpdates.status = updates.status;
  }

  if (Object.keys(persistUpdates).length === 0) {
    return { ok: false, error: "No onboarding fields to update.", status: 400 };
  }

  await persistWorkspaceOnboardingState({
    workspaceId,
    actorUserId: userId,
    updates: persistUpdates,
  });

  const detail = await getWorkspaceOnboardingDetail(userId, workspaceId);
  if (!detail.ok) {
    return detail;
  }
  return { ok: true, detail: detail.detail };
}

export async function runOnboardingAction(
  userId: string,
  workspaceId: string,
  actionName: string,
  input: FormData | Record<string, unknown>,
): Promise<
  | {
      ok: true;
      result: OnboardingHandlerResult;
      detail: WorkspaceOnboardingDetail;
    }
  | { ok: false; error: string; status: number }
> {
  if (!isOnboardingActionName(actionName)) {
    return { ok: false, error: "Unknown onboarding action.", status: 400 };
  }

  const admin = await requireOnboardingAdmin(userId, workspaceId);
  if (!admin.ok) {
    return admin;
  }

  const ctx: OnboardingActionContext = {
    input,
    workspaceId, 
    user: { id: userId },
    actorUserId: userId,
  };

  try {
    const result = await ONBOARDING_ACTION_HANDLERS[actionName](ctx);
    const detail = await getWorkspaceOnboardingDetail(userId, workspaceId);
    if (!detail.ok) {
      return detail;
    }
    return { ok: true, result, detail: detail.detail };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Onboarding update failed.",
      status: 500,
    };
  }
}

export type MappedOnboardingResult =
  | {
      kind: "ui_redirect";
      step: string;
      searchParams?: Record<string, string>;
    }
  | {
      kind: "ui_redirect_path";
      path: string;
      searchParams?: Record<string, string>;
    }
  | {
      kind: "ui_payload";
      data: OnboardingActionData;
      status: number;
    }
  | {
      kind: "api_json";
      body: Record<string, unknown>;
      status: number;
    };

export function mapOnboardingHandlerResult(
  handlerResult: OnboardingHandlerResult,
  detail: WorkspaceOnboardingDetail,
  target: "ui" | "api",
): MappedOnboardingResult {
  if (handlerResult.kind === "redirect") {
    if (target === "ui") {
      return {
        kind: "ui_redirect",
        step: handlerResult.step,
        searchParams: handlerResult.searchParams,
      };
    }
    return {
      kind: "api_json",
      body: {
        ...detail,
        redirect: {
          step: handlerResult.step,
          search_params: handlerResult.searchParams ?? null,
        },
      },
      status: 200,
    };
  }

  if (handlerResult.kind === "redirect_path") {
    if (target === "ui") {
      return {
        kind: "ui_redirect_path",
        path: handlerResult.path,
        searchParams: handlerResult.searchParams,
      };
    }
    return {
      kind: "api_json",
      body: {
        ...detail,
        redirect: {
          path: handlerResult.path,
          search_params: handlerResult.searchParams ?? null,
        },
      },
      status: 200,
    };
  }

  const status = handlerResult.status ?? (handlerResult.data.error ? 400 : 200);
  if (target === "ui") {
    return {
      kind: "ui_payload",
      data: handlerResult.data,
      status,
    };
  }

  const apiStatus =
    handlerResult.data.error && status < 400 ? 400 : status;

  return {
    kind: "api_json",
    body: { ...detail, ...handlerResult.data },
    status: apiStatus,
  };
}
