import {
  getWorkspacePhoneNumbers,
} from "@/lib/database/workspace.server";
import { getWorkspaceRecentOutboundMessageCount } from "@/lib/database/workspace-twilio-portal-snapshot.server";
import type { Tables } from "@/lib/db-types";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  applyWorkspaceOnboardingChannelPolicy,
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import type { OnboardingActionData } from "@/lib/onboarding-actions.server";
import {
  getWorkspaceRcsBlockingIssues,
  hydrateWorkspaceRcsOnboardingState,
  isRcsOnboardingEnabled,
} from "@/lib/rcs-onboarding.server";
import { buildA2pBlockingIssues } from "@/lib/twilio-a2p.server";
import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
  WorkspaceOperatingCountry,
} from "@/lib/types";
import { WORKSPACE_OPERATING_COUNTRY_VALUES } from "@/lib/types";
import { getWorkspaceCredits } from "@/lib/workspace-members-db.server";
import { createTenantDb } from "@/server/tenant-db";

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

export type WorkspaceOnboardingView = {
  onboarding: WorkspaceMessagingOnboardingState;
  phoneNumbers: Tables<"workspace_number">[] | null;
  creditsBalance: number;
  readiness: WorkspaceMessagingReadiness;
  rcsBlockingIssues: string[];
  a2pBlockingIssues: string[];
  audienceCount: number;
  campaignCount: number;
  scriptCount: number;
  recentOutboundCount: number;
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

export function resolveOperatingCountryFromForm(
  formData: FormData,
  fallback: WorkspaceOperatingCountry,
): WorkspaceOperatingCountry {
  const operatingCountryRaw = String(
    formData.get("operatingCountry") ?? formData.get("operating_country") ?? "",
  );
  return WORKSPACE_OPERATING_COUNTRY_VALUES.includes(
    operatingCountryRaw as WorkspaceOperatingCountry,
  )
    ? (operatingCountryRaw as WorkspaceOperatingCountry)
    : fallback;
}

/** Prefer an in-workspace returnTo path; otherwise return a success or error payload. */
export function redirectToReturnToOrPayload(
  formData: FormData,
  workspaceId: string,
  savedKey: string,
  successMessage: string,
  options?: { error?: string; status?: number },
): OnboardingHandlerResult {
  const returnTo = String(
    formData.get("returnTo") ?? formData.get("return_to") ?? "",
  );
  if (returnTo.startsWith(`/workspaces/${workspaceId}`)) {
    if (options?.error) {
      return {
        kind: "redirect_path",
        path: returnTo,
        searchParams: { warning: options.error },
      };
    }
    return {
      kind: "redirect_path",
      path: returnTo,
      searchParams: { saved: savedKey },
    };
  }
  if (options?.error) {
    return {
      kind: "payload",
      data: { error: options.error },
      status: options.status,
    };
  }
  return {
    kind: "payload",
    data: { success: successMessage },
  };
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

export async function loadWorkspaceOnboardingView(
  workspaceId: string,
): Promise<WorkspaceOnboardingView> {
  const tdb = createTenantDb(workspaceId);

  const [
    { data: phoneNumbers },
    onboarding,
    creditsBalance,
    recentOutboundCount,
    audienceCount,
    campaignCount,
    scriptCount,
  ] = await Promise.all([
    getWorkspacePhoneNumbers({ workspaceId }),
    getWorkspaceMessagingOnboardingState({ workspaceId }),
    getWorkspaceCredits(workspaceId),
    getWorkspaceRecentOutboundMessageCount({ workspaceId }),
    tdb.audience.count(),
    tdb.campaign.count(),
    tdb.script.count(),
  ]);

  const hydratedOnboarding = applyOnboardingStepsWithWorkspaceNumbers(
    hydrateWorkspaceRcsOnboardingState(applyWorkspaceOnboardingChannelPolicy(onboarding)),
    phoneNumbers ?? [],
    {
      audienceCount,
      scriptCount,
      campaignCount,
      creditsBalance: creditsBalance ?? 0,
    },
  );

  const rcsBlockingIssues =
    isRcsOnboardingEnabled() && hydratedOnboarding.selectedChannels.includes("rcs")
      ? getWorkspaceRcsBlockingIssues(hydratedOnboarding)
      : [];

  const readiness = deriveWorkspaceMessagingReadiness({
    onboarding: hydratedOnboarding,
    workspaceNumbers: (phoneNumbers ?? []).map((number) => ({
      type: number?.type ?? null,
      phone_number: number?.phone_number ?? null,
      capabilities: number?.capabilities ?? null,
    })),
    recentOutboundCount,
  });

  return {
    onboarding: hydratedOnboarding,
    phoneNumbers: phoneNumbers ?? null,
    creditsBalance: creditsBalance ?? 0,
    readiness,
    rcsBlockingIssues,
    a2pBlockingIssues: buildA2pBlockingIssues(hydratedOnboarding),
    audienceCount,
    campaignCount,
    scriptCount,
    recentOutboundCount,
  };
}
