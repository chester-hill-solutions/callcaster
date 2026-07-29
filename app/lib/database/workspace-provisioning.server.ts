/**
 * Workspace creation and initial provisioning (Twilio, Stripe, welcome credits).
 */
import { eq } from "drizzle-orm";
import { workspace } from "@/db/schema";
import { authUser } from "@/db/auth-schema";
import { welcomeCreditsKey } from "@/lib/billing-keys";
import { rpcCreateNewWorkspace } from "@/lib/db-rpc.server";
import { ensureProfileForUser } from "@/lib/ensure-user-profile.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import {
  buildOnboardingStepsForState,
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { invalidateWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { seedWorkspaceSampleData } from "@/lib/seed/seed-workspace-sample-data.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { ensureVoiceGeoPermissions } from "@/lib/twilio-geo-permissions.server";
import { addUserToWorkspace } from "@/lib/workspace-membership.server";
import { adminDb } from "@/server/admin-db";
import { createStripeContact } from "./stripe.server";
import {
  createKeys,
  createSubaccount,
  twilioAccountToPersistableJson,
} from "./workspace.server";

/** Every new workspace starts with free credits so teams can try calling/texting before paying. */
export const NEW_WORKSPACE_WELCOME_CREDITS = 100;

export async function createNewWorkspace({
  workspaceName,
  user_id,
}: {
  workspaceName: string;
  user_id: string;
}): Promise<{
  data: string | null;
  error: string | null;
  provisioningWarning?: string | null;
}> {
  let workspaceId: string | null = null;
  const provisioningWarnings: string[] = [];

  try {
    // Domain tables + create_new_workspace RPC key users by uuid. Better Auth now
    // uses generateId=crypto.randomUUID(), but legacy nanoid auth rows cannot be
    // mirrored into public.user / cast for the RPC.
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        user_id,
      )
    ) {
      logger.error("createNewWorkspace rejected non-uuid auth user id", {
        userId: user_id,
      });
      return {
        data: null,
        error:
          "This account uses an unsupported user id format. Sign out and sign up again, or contact support.",
        provisioningWarning: null,
      };
    }

    // Safety net for users who signed up before databaseHooks.user.create.after
    // mirrored auth_user → public.user (required by workspace_users FK).
    const [authRow] = await adminDb
      .select({
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
      })
      .from(authUser)
      .where(eq(authUser.id, user_id))
      .limit(1);
    if (authRow) {
      await ensureProfileForUser(authRow);
    }

    const insertWorkspaceData = await rpcCreateNewWorkspace(workspaceName, user_id);
    const createdWorkspaceId = insertWorkspaceData;
    workspaceId = createdWorkspaceId;

    // Phase C: RPC still seeds legacy workspace_users; also create CHS membership
    // so getUserRole / requireWorkspaceAccess see the owner (no dual-write of
    // membership mutations elsewhere — this only fills the CHS gap left by RPC).
    const { error: ownerMembershipError } = await addUserToWorkspace({
      workspaceId: createdWorkspaceId,
      userId: user_id,
      role: "owner",
    });
    if (ownerMembershipError) {
      logger.error(
        "CHS owner membership insert failed after workspace create:",
        ownerMembershipError,
      );
      provisioningWarnings.push("Owner membership was not created");
    }

    let account: Awaited<ReturnType<typeof createSubaccount>> | null = null;
    try {
      account = await createSubaccount({
        workspace_id: createdWorkspaceId,
      });
      if (!account) {
        provisioningWarnings.push("Twilio subaccount was not created");
      }
    } catch (subaccountError) {
      logger.error("Twilio subaccount creation failed after workspace insert:", subaccountError);
      provisioningWarnings.push("Twilio subaccount creation failed");
    }

    let newKey: Awaited<ReturnType<typeof createKeys>> | null = null;
    if (account) {
      try {
        newKey = await createKeys({
          workspace_id: createdWorkspaceId,
          sid: account.sid,
          token: account.authToken,
        });
        if (!newKey) {
          provisioningWarnings.push("Twilio API keys were not created");
        }
      } catch (keyError) {
        logger.error("Twilio API key creation failed after workspace insert:", keyError);
        provisioningWarnings.push("Twilio API key creation failed");
      }
    }

    let stripeCustomerId: string | null = null;
    try {
      const newStripeCustomer = await createStripeContact({
        workspace_id: createdWorkspaceId,
      });
      stripeCustomerId = newStripeCustomer.id;
    } catch (stripeError) {
      logger.error("Stripe customer creation failed after workspace insert:", stripeError);
      provisioningWarnings.push("Stripe customer creation failed");
    }

    const seededOnboarding = mergeWorkspaceMessagingOnboardingState(
      DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      {
        subaccountBootstrap: {
          ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE.subaccountBootstrap,
          callbackBaseUrl: env.BASE_URL(),
          inboundVoiceUrl: `${env.BASE_URL()}/api/inbound`,
          inboundSmsUrl: `${env.BASE_URL()}/api/inbound-sms`,
          statusCallbackUrl: `${env.BASE_URL()}/api/caller-id/status`,
          status: "provisioning",
        },
        status: "provisioning",
        currentStep: "business_identity",
        lastUpdatedBy: user_id,
      },
    );
    seededOnboarding.steps = buildOnboardingStepsForState(seededOnboarding);

    const twilioPayload = account
      ? { ...twilioAccountToPersistableJson(account), onboarding: seededOnboarding }
      : { onboarding: seededOnboarding };

    const workspaceUpdate: {
      twilio_data: string;
      key?: string;
      token?: string;
      stripe_id?: string;
    } = {
      twilio_data: JSON.stringify(twilioPayload),
    };
    if (newKey) {
      workspaceUpdate.key = newKey.sid;
      workspaceUpdate.token = newKey.secret;
    }
    if (stripeCustomerId) {
      workspaceUpdate.stripe_id = stripeCustomerId;
    }

    try {
      await adminDb
        .update(workspace)
        .set(workspaceUpdate)
        .where(eq(workspace.id, createdWorkspaceId));
      // workspaceUpdate always carries twilio_data (and, when Twilio keys
      // were minted above, key/token) — bust the cached credentials/client
      // for this workspace so subsequent lookups don't serve stale data.
      invalidateWorkspaceTwilioData(createdWorkspaceId);
    } catch (insertWorkspaceUsersError) {
      logger.error(
        "Workspace metadata update failed after workspace insert:",
        insertWorkspaceUsersError,
      );
      provisioningWarnings.push("Workspace provisioning metadata update failed");
    }

    if (account && newKey) {
      try {
        await ensureWorkspaceTwilioBootstrap({
          workspaceId: createdWorkspaceId,
          actorUserId: user_id,
        });
      } catch (bootstrapError) {
        logger.error(
          "Workspace Twilio bootstrap failed after workspace creation:",
          bootstrapError,
        );
        provisioningWarnings.push("Twilio bootstrap is still running");
      }

      // Voice geographic permissions are the one runbook §1 toggle Twilio
      // exposes an API for — enable CA/US on the new subaccount here so no
      // Console visit is needed. Never fatal; the compliance job re-runs
      // this on every retry, so a transient failure self-heals.
      const geoResult = await ensureVoiceGeoPermissions({
        workspaceId: createdWorkspaceId,
      });
      if (!geoResult.ok) {
        provisioningWarnings.push(
          "Voice geographic permissions could not be enabled automatically",
        );
      }
    }

    try {
      await insertTransactionHistoryIdempotent({
        workspaceId: createdWorkspaceId,
        type: "CREDIT",
        amount: NEW_WORKSPACE_WELCOME_CREDITS,
        note: `Welcome bonus: ${NEW_WORKSPACE_WELCOME_CREDITS} free credits to get started`,
        idempotencyKey: welcomeCreditsKey(createdWorkspaceId),
      });
    } catch (welcomeCreditError) {
      logger.error(
        "Welcome credit grant failed after workspace creation:",
        welcomeCreditError,
      );
      provisioningWarnings.push("Welcome credits were not granted");
    }

    try {
      await seedWorkspaceSampleData(createdWorkspaceId, user_id);
    } catch (seedError) {
      logger.error(
        "Sample data seeding failed after workspace creation:",
        seedError,
      );
      provisioningWarnings.push("Sample data seeding failed");
    }

    return {
      data: workspaceId,
      error: null,
      provisioningWarning:
        provisioningWarnings.length > 0 ? provisioningWarnings.join("; ") : null,
    };
  } catch (error) {
    logger.error("Error in createNewWorkspace:", error);
    if (workspaceId) {
      return {
        data: workspaceId,
        error: null,
        provisioningWarning:
          error instanceof Error
            ? `Workspace created but provisioning failed: ${error.message}`
            : "Workspace created but provisioning failed",
      };
    }
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
      provisioningWarning: null,
    };
  }
}
