import {
  getWorkspacePhoneNumbers,
} from "@/lib/database/workspace.server";
import type { Tables } from "@/lib/db-types";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  applyWorkspaceOnboardingChannelPolicy,
  getWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import type { OnboardingActionData } from "@/lib/onboarding-actions.server";
import {
  hydrateWorkspaceRcsOnboardingState,
} from "@/lib/rcs-onboarding.server";
import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
} from "@/lib/types";

export type OnboardingHandlerResult =
  | {
      kind: "redirect";
      step: string;
      searchParams?: Record<string, string>;
    }
  | {
      /** Leave the wizard and open a workspace path (e.g. Today after intake). */
      kind: "redirect_path";
      path: string;
      searchParams?: Record<string, string>;
    }
  | {
      kind: "payload";
      data: OnboardingActionData;
      status?: number;
    };

export type OnboardingActionContext = {
  input: FormData | Record<string, unknown>;
  workspaceId: string;
  user: { id: string };
  actorUserId: string | null;
};

export type WorkspaceOnboardingDetail = {
  onboarding: WorkspaceMessagingOnboardingState;
  readiness: WorkspaceMessagingReadiness;
  a2p_blocking_issues: string[];
  rcs_blocking_issues: string[];
  phone_numbers: Tables<"workspace_number">[] | null;
  credits_balance: number;
};

function jsonInputToFormData(body: Record<string, unknown>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      if (key === "sampleMessages" || key === "sample_messages") {
        formData.set(
          "sampleMessages",
          value.map((item) => String(item)).join("\n"),
        );
        continue;
      }
      const formKey = key === "selected_channels" ? "selectedChannels" : key;
      for (const item of value) {
        formData.append(formKey, String(item));
      }
      continue;
    }
    if (key === "sample_messages") {
      formData.set("sampleMessages", String(value));
      continue;
    }
    formData.set(key, String(value));
  }
  return formData;
}

export function resolveOnboardingInput(
  input: FormData | Record<string, unknown>,
): FormData {
  return input instanceof FormData ? input : jsonInputToFormData(input);
}

export function adaptRouteDataResult(result: unknown): OnboardingHandlerResult {
  if (result && typeof result === "object" && "data" in result) {
    const wrapped = result as {
      data: OnboardingActionData;
      init?: number | { status?: number } | null;
    };
    const status =
      typeof wrapped.init === "number"
        ? wrapped.init
        : wrapped.init?.status ?? 200;
    return { kind: "payload", data: wrapped.data, status };
  }
  return { kind: "payload", data: {}, status: 200 };
}

export async function hydrateWorkspaceOnboarding(workspaceId: string) {
  const [{ data: phoneNumbers }, onboarding] = await Promise.all([
    getWorkspacePhoneNumbers({ workspaceId }),
    getWorkspaceMessagingOnboardingState({ workspaceId }),
  ]);

  const hydratedOnboarding = applyOnboardingStepsWithWorkspaceNumbers(
    hydrateWorkspaceRcsOnboardingState(applyWorkspaceOnboardingChannelPolicy(onboarding)),
    phoneNumbers ?? [],
  );

  return { phoneNumbers: phoneNumbers ?? null, onboarding: hydratedOnboarding };
}
