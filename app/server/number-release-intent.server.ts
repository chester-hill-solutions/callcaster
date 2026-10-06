import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import {
  workspace,
  workspace_number,
  workspace_number_purchase,
  workspace_number_release,
} from "@/db/schema";
import { db, type Database } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import {
  getWorkspaceMessagingOnboardingState,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding/persistence.server";
import { invalidateWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";

export type NumberRelease = typeof workspace_number_release.$inferSelect;
type ReleaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const ACTIVE_STATES = ["prepared", "releasing", "released"] as const;
const LEASE_MS = 5 * 60_000;

function releaseIdentity(workspaceId: string, numberId: number) {
  return and(
    eq(workspace_number_release.workspace, workspaceId),
    eq(workspace_number_release.number_id, numberId),
  );
}

function ownedRelease(release: NumberRelease) {
  return and(
    eq(workspace_number_release.id, release.id),
    eq(workspace_number_release.workspace, release.workspace),
    eq(workspace_number_release.lease_token, release.lease_token),
    gt(workspace_number_release.lease_expires_at, new Date()),
    inArray(workspace_number_release.state, [...ACTIVE_STATES]),
  );
}

export async function getNumberRelease(workspaceId: string, numberId: number) {
  const [release] = await db
    .select()
    .from(workspace_number_release)
    .where(releaseIdentity(workspaceId, numberId));
  return release;
}

export async function beginNumberRelease(
  workspaceId: string,
  numberId: number,
  accountSid: string,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ twilioData: workspace.twilio_data })
      .from(workspace)
      .where(eq(workspace.id, workspaceId))
      .for("update");
    if (!row) throw new Error("Workspace not found");
    const [existing] = await tx
      .select()
      .from(workspace_number_release)
      .where(releaseIdentity(workspaceId, numberId))
      .for("update");
    if (existing?.state === "completed")
      return { owned: false, release: existing };
    if (existing && existing.lease_expires_at.getTime() > Date.now())
      return { owned: false, release: existing };
    if (existing) {
      const [claimed] = await tx
        .update(workspace_number_release)
        .set({
          lease_token: randomUUID(),
          lease_expires_at: new Date(Date.now() + LEASE_MS),
          updated_at: new Date(),
        })
        .where(releaseIdentity(workspaceId, numberId))
        .returning();
      if (!claimed) throw new Error("Number release lease was not saved");
      return { owned: true, release: claimed };
    }
    const number = await createTenantDb(
      workspaceId,
      tx,
    ).workspace_number.findFirst({ where: eq(workspace_number.id, numberId) });
    if (!number?.phone_number) throw new Error("Number not found");
    const data =
      typeof row.twilioData === "string"
        ? JSON.parse(row.twilioData)
        : row.twilioData;
    if (readTwilioWorkspaceCredentials(data)?.sid !== accountSid)
      throw new Error("Workspace provider account changed");
    const [purchase] = number.twilio_phone_number_sid
      ? await tx
          .select({ accountSid: workspace_number_purchase.account_sid })
          .from(workspace_number_purchase)
          .where(
            and(
              eq(workspace_number_purchase.workspace, workspaceId),
              eq(
                workspace_number_purchase.provider_sid,
                number.twilio_phone_number_sid,
              ),
              eq(workspace_number_purchase.state, "completed"),
            ),
          )
          .limit(1)
      : [];
    if (purchase && purchase.accountSid !== accountSid)
      throw new Error("The number's original provider account is required");
    const onboarding = await getWorkspaceMessagingOnboardingState({
      workspaceId,
      transaction: tx,
    });
    const [release] = await tx
      .insert(workspace_number_release)
      .values({
        id: randomUUID(),
        workspace: workspaceId,
        number_id: numberId,
        number_created_at: number.created_at,
        number_type: number.type,
        phone_number: number.phone_number,
        friendly_name: number.friendly_name,
        provider_sid: number.twilio_phone_number_sid,
        account_sid: accountSid,
        messaging_service_sids: onboarding.messagingService.serviceSid
          ? [onboarding.messagingService.serviceSid]
          : [],
        lease_token: randomUUID(),
        lease_expires_at: new Date(Date.now() + LEASE_MS),
      })
      .returning();
    if (!release) throw new Error("Number release intent was not saved");
    return { owned: true, release };
  });
}

async function lockOwnedRelease(
  tx: ReleaseTransaction,
  release: NumberRelease,
) {
  // Wait for an uncertain commit before permitting another provider operation.
  await tx
    .select({ id: workspace.id })
    .from(workspace)
    .where(eq(workspace.id, release.workspace))
    .for("update");
  const [owned] = await tx
    .select()
    .from(workspace_number_release)
    .where(ownedRelease(release))
    .for("update");
  if (!owned) throw new Error("Number release lease is no longer owned");
  return owned;
}

export async function getOwnedNumberRelease(release: NumberRelease) {
  return db.transaction((tx) => lockOwnedRelease(tx, release));
}

export async function saveNumberReleaseTargets(
  release: NumberRelease,
  incomingSids: string[],
  outgoingSids: string[],
) {
  const [saved] = await db
    .update(workspace_number_release)
    .set({
      incoming_sids: incomingSids,
      outgoing_sids: outgoingSids,
      updated_at: new Date(),
    })
    .where(
      and(
        ownedRelease(release),
        eq(workspace_number_release.state, "prepared"),
      ),
    )
    .returning();
  if (!saved) throw new Error("Number release targets are no longer owned");
  return saved;
}

async function removeReleasedSender(
  tx: ReleaseTransaction,
  release: NumberRelease,
) {
  const onboarding = await getWorkspaceMessagingOnboardingState({
    workspaceId: release.workspace,
    transaction: tx,
  });
  await updateWorkspaceMessagingOnboardingState({
    workspaceId: release.workspace,
    transaction: tx,
    actorUserId: null,
    updates: {
      messagingService: {
        ...onboarding.messagingService,
        attachedSenderPhoneNumbers:
          onboarding.messagingService.attachedSenderPhoneNumbers.filter(
            (phone) => phone !== release.phone_number,
          ),
      },
    },
  });
  return onboarding.messagingService.serviceSid;
}

export async function prepareNumberReleaseBookkeeping(release: NumberRelease) {
  const saved = await db.transaction(async (tx) => {
    const owned = await lockOwnedRelease(tx, release);
    if (owned.incoming_sids === null || owned.outgoing_sids === null)
      throw new Error("Number release targets are not verified");
    if (owned.state === "released") return owned;
    const serviceSid = await removeReleasedSender(tx, owned);
    const services = [
      ...new Set([
        ...owned.messaging_service_sids,
        ...(serviceSid ? [serviceSid] : []),
      ]),
    ];
    const [updated] = await tx
      .update(workspace_number_release)
      .set({
        state: "releasing",
        messaging_service_sids: services,
        updated_at: new Date(),
      })
      .where(ownedRelease(owned))
      .returning();
    if (!updated) throw new Error("Number release bookkeeping was not saved");
    return updated;
  });
  invalidateWorkspaceTwilioData(release.workspace);
  return saved;
}

export async function recordNumberReleaseProvider(release: NumberRelease) {
  const [saved] = await db
    .update(workspace_number_release)
    .set({ state: "released", updated_at: new Date() })
    .where(
      and(
        ownedRelease(release),
        eq(workspace_number_release.state, "releasing"),
      ),
    )
    .returning();
  if (!saved)
    throw new Error("Number release provider completion was not saved");
  return saved;
}

export async function finishNumberRelease(release: NumberRelease) {
  const needsSenderCleanup = await db.transaction(async (tx) => {
    const owned = await lockOwnedRelease(tx, release);
    if (owned.state !== "released")
      throw new Error("Provider number release is not confirmed");
    const tdb = createTenantDb(release.workspace, tx);
    const [number] = await tx
      .select()
      .from(workspace_number)
      .where(
        and(
          eq(workspace_number.workspace, release.workspace),
          eq(workspace_number.id, release.number_id),
        ),
      )
      .for("update");
    if (
      number &&
      (number.phone_number !== owned.phone_number ||
        number.twilio_phone_number_sid !== owned.provider_sid ||
        number.created_at !== owned.number_created_at)
    ) {
      throw new Error("Number identity changed during release");
    }
    const currentService = await removeReleasedSender(tx, owned);
    if (
      currentService &&
      owned.incoming_sids?.length &&
      !owned.messaging_service_sids.includes(currentService)
    ) {
      // A concurrent onboarding write can attach this phone to another pool.
      // Retain its identity and commit a new cleanup phase before reporting it.
      const [pending] = await tx
        .update(workspace_number_release)
        .set({
          state: "releasing",
          messaging_service_sids: [
            ...owned.messaging_service_sids,
            currentService,
          ],
          updated_at: new Date(),
        })
        .where(ownedRelease(owned))
        .returning();
      if (!pending) throw new Error("Changed sender service was not saved");
      return true;
    }
    await tdb.workspace_number.delete({
      where: eq(workspace_number.id, release.number_id),
    });
    const [completed] = await tx
      .update(workspace_number_release)
      .set({ state: "completed", last_error: null, updated_at: new Date() })
      .where(ownedRelease(owned))
      .returning();
    if (!completed) throw new Error("Number release completion was not saved");
    return false;
  });
  invalidateWorkspaceTwilioData(release.workspace);
  if (needsSenderCleanup)
    throw new Error("The changed Messaging Service needs sender cleanup");
}

export async function deferNumberRelease(release: NumberRelease) {
  await db
    .update(workspace_number_release)
    .set({
      last_error: "Number release needs sender or provider recovery.",
      lease_expires_at: new Date(),
      updated_at: new Date(),
    })
    .where(ownedRelease(release));
}

export async function claimNumberReleaseRecovery(limit = 25) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(workspace_number_release)
      .where(
        and(
          inArray(workspace_number_release.state, [...ACTIVE_STATES]),
          lt(workspace_number_release.lease_expires_at, new Date()),
        ),
      )
      .orderBy(workspace_number_release.lease_expires_at)
      .limit(limit)
      .for("update", { skipLocked: true });
    if (!rows.length) return [];
    return tx
      .update(workspace_number_release)
      .set({
        lease_token: randomUUID(),
        lease_expires_at: new Date(Date.now() + LEASE_MS),
      })
      .where(
        inArray(
          workspace_number_release.id,
          rows.map((row) => row.id),
        ),
      )
      .returning();
  });
}
