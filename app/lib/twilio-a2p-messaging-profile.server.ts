import type Twilio from "twilio";
import { isObject } from "@/lib/type-safety-utils";
import {
  getA2pMessagingProfileAttributes,
  validateProviderA2pProfileAttributes,
} from "@/lib/a2p-messaging-profile.server";
import { updateWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import type {
  WorkspaceA2POnboardingState,
  WorkspaceMessagingOnboardingState,
} from "@/lib/types";
import {
  assignA2pTrustProductEntity,
  createA2pMessagingProfileEndUser,
  createA2pTrustProduct,
  evaluateA2pTrustProduct,
  fetchA2pMessagingProfileEndUser,
  fetchA2pTrustProduct,
  listA2pMessagingProfileEndUsers,
  listA2pTrustProductEntities,
  listA2pTrustProducts,
  submitA2pTrustProduct,
  updateA2pMessagingProfileEndUser,
} from "@/lib/twilio-client.server";

type PreparationContext = {
  twilio: Twilio.Twilio;
  workspaceId: string;
  actorUserId: string | null;
  customerProfileBundleSid: string;
  onboarding: WorkspaceMessagingOnboardingState;
  policySid: string;
  email: string;
  statusCallback: string;
};

type TrustProduct = Awaited<ReturnType<typeof fetchA2pTrustProduct>>;
type EndUser = Awaited<ReturnType<typeof fetchA2pMessagingProfileEndUser>>;
type Assignment = Awaited<
  ReturnType<typeof listA2pTrustProductEntities>
>[number];
const PROFILE_TYPE = "us_a2p_messaging_profile_information";
const SUBMITTED_STATUSES = [
  "pending-review",
  "in-review",
  "twilio-approved",
] as const;

async function persistProfile(
  c: PreparationContext,
  patch: Partial<WorkspaceA2POnboardingState>,
) {
  await updateWorkspaceMessagingOnboardingState({
    workspaceId: c.workspaceId,
    actorUserId: c.actorUserId,
    updates: { a2p10dlc: { ...patch, lastSyncedAt: new Date().toISOString() } },
  });
}

function requireProduct(product: TrustProduct, c: PreparationContext): void {
  if (!product.sid || product.policySid !== c.policySid)
    throw new Error("A2P Messaging Profile has an invalid SID or policy.");
  if (
    product.status !== "draft" &&
    product.status !== "twilio-rejected" &&
    !SUBMITTED_STATUSES.some((status) => status === product.status)
  ) {
    throw new Error("A2P Messaging Profile status is missing or unrecognized.");
  }
}

async function ensureProduct(c: PreparationContext): Promise<TrustProduct> {
  const storedSid = c.onboarding.a2p10dlc.trustProductSid;
  if (storedSid) {
    const product = await fetchA2pTrustProduct(c.twilio, storedSid, {
      workspaceId: c.workspaceId,
      operation: "trusthub.trustProducts.fetch",
    });
    if (product.sid !== storedSid)
      throw new Error("A2P Messaging Profile read returned a different SID.");
    requireProduct(product, c);
    return product;
  }
  const friendlyName = `CallCaster ${c.workspaceId} A2P Messaging Profile`;
  const products = await listA2pTrustProducts(c.twilio, {
    workspaceId: c.workspaceId,
    operation: "trusthub.trustProducts.list",
  });
  const matches = products.filter(
    (product) =>
      product.friendlyName === friendlyName &&
      product.policySid === c.policySid,
  );
  if (matches.length > 1)
    throw new Error(
      "Multiple owned A2P Messaging Profiles exist. Review them before retrying.",
    );
  const product =
    matches[0] ??
    (await createA2pTrustProduct(
      c.twilio,
      {
        friendlyName,
        email: c.email,
        policySid: c.policySid,
        statusCallback: c.statusCallback,
      },
      {
        workspaceId: c.workspaceId,
        operation: "trusthub.trustProducts.create",
      },
    ));
  if (!product.sid) throw new Error("A2P Trust Product SID was not returned.");
  await persistProfile(c, { trustProductSid: product.sid });
  requireProduct(product, c);
  return product;
}

async function findEndUser(
  c: PreparationContext,
  assignments: Assignment[],
): Promise<EndUser | null> {
  const storedSid = c.onboarding.a2p10dlc.messagingProfileEndUserSid;
  if (storedSid) {
    const user = await fetchA2pMessagingProfileEndUser(c.twilio, storedSid, {
      workspaceId: c.workspaceId,
      operation: "trusthub.endUsers.fetch",
    });
    if (user.sid !== storedSid || user.type !== PROFILE_TYPE)
      throw new Error(
        "The saved A2P Messaging Profile EndUser does not match its required type or SID.",
      );
    return user;
  }
  const matches: EndUser[] = [];
  for (const assignment of assignments) {
    if (!assignment.objectSid?.startsWith("IT")) continue;
    const user = await fetchA2pMessagingProfileEndUser(
      c.twilio,
      assignment.objectSid,
      { workspaceId: c.workspaceId, operation: "trusthub.endUsers.fetch" },
    );
    if (user.sid !== assignment.objectSid)
      throw new Error("Assigned A2P EndUser read returned a different SID.");
    if (user.type === PROFILE_TYPE) matches.push(user);
  }
  if (matches.length > 1)
    throw new Error(
      "Multiple A2P Messaging Profile EndUsers are assigned. Review them before retrying.",
    );
  if (matches[0]) return matches[0];
  const users = await listA2pMessagingProfileEndUsers(c.twilio, {
    workspaceId: c.workspaceId,
    operation: "trusthub.endUsers.list",
  });
  const named = users.filter(
    (user) =>
      user.type === PROFILE_TYPE &&
      user.friendlyName ===
        `CallCaster ${c.workspaceId} A2P Messaging Profile EndUser`,
  );
  if (named.length > 1)
    throw new Error(
      "Multiple owned A2P Messaging Profile EndUsers exist. Review them before retrying.",
    );
  return named[0] ?? null;
}

function attributesMatch(
  actual: unknown,
  expected: Record<string, string>,
): boolean {
  if (!isObject(actual) || !validateProviderA2pProfileAttributes(actual))
    return false;
  return Object.entries(expected).every(
    ([key, value]) => actual[key] === value,
  );
}

async function ensureEndUser(
  c: PreparationContext,
  product: TrustProduct,
  assignments: Assignment[],
): Promise<EndUser> {
  const requested = getA2pMessagingProfileAttributes(
    c.onboarding.businessProfile,
  );
  let user = await findEndUser(c, assignments);
  const mutable =
    product.status === "draft" || product.status === "twilio-rejected";
  if ((!user || mutable) && !requested.ok)
    throw new Error(requested.issues.join(" "));
  if (!user) {
    if (!requested.ok) throw new Error(requested.issues.join(" "));
    user = await createA2pMessagingProfileEndUser(
      c.twilio,
      {
        friendlyName: `CallCaster ${c.workspaceId} A2P Messaging Profile EndUser`,
        attributes: requested.attributes,
      },
      { workspaceId: c.workspaceId, operation: "trusthub.endUsers.create" },
    );
  }
  if (!user.sid || user.type !== PROFILE_TYPE)
    throw new Error(
      "A2P Messaging Profile EndUser SID or type was not returned.",
    );
  await persistProfile(c, { messagingProfileEndUserSid: user.sid });
  if (requested.ok && !attributesMatch(user.attributes, requested.attributes)) {
    const attributes: Record<string, unknown> = isObject(user.attributes)
      ? { ...user.attributes, ...requested.attributes }
      : { ...requested.attributes };
    if (requested.attributes.company_type !== "public") {
      delete attributes.stock_exchange;
      delete attributes.stock_ticker;
      delete attributes.brand_contact_email;
    }
    const expectedSid = user.sid;
    user = await updateA2pMessagingProfileEndUser(
      c.twilio,
      expectedSid,
      attributes,
      { workspaceId: c.workspaceId, operation: "trusthub.endUsers.update" },
    );
    if (user.sid !== expectedSid || user.type !== PROFILE_TYPE)
      throw new Error("A2P EndUser update returned a different SID or type.");
    if (!attributesMatch(user.attributes, requested.attributes))
      throw new Error(
        "The provider did not retain the selected A2P business attributes.",
      );
  }
  if (!validateProviderA2pProfileAttributes(user.attributes))
    throw new Error(
      "A2P Messaging Profile business attributes are incomplete or invalid. Complete Business identity before retrying.",
    );
  return user;
}

async function ensureAssignments(
  c: PreparationContext,
  productSid: string,
  userSid: string,
  assignments: Assignment[],
) {
  for (const objectSid of [userSid, c.customerProfileBundleSid]) {
    if (assignments.some((assignment) => assignment.objectSid === objectSid))
      continue;
    const assigned = await assignA2pTrustProductEntity(
      c.twilio,
      productSid,
      objectSid,
      {
        workspaceId: c.workspaceId,
        operation: "trusthub.trustProducts.entityAssignments.create",
      },
    );
    if (!assigned.sid || assigned.objectSid !== objectSid)
      throw new Error(
        "A2P Messaging Profile entity assignment was not confirmed.",
      );
  }
}

async function evaluateAndSubmit(
  c: PreparationContext,
  productSid: string,
): Promise<void> {
  let product = await fetchA2pTrustProduct(c.twilio, productSid, {
    workspaceId: c.workspaceId,
    operation: "trusthub.trustProducts.fetch",
  });
  if (product.sid !== productSid)
    throw new Error("A2P Messaging Profile read returned a different SID.");
  requireProduct(product, c);
  const evaluation = await evaluateA2pTrustProduct(
    c.twilio,
    productSid,
    c.policySid,
    {
      workspaceId: c.workspaceId,
      operation: "trusthub.trustProducts.evaluations.create",
    },
  );
  if (
    !evaluation.sid ||
    evaluation.trustProductSid !== productSid ||
    evaluation.policySid !== c.policySid ||
    evaluation.status !== "compliant"
  ) {
    throw new Error(
      "A2P Messaging Profile evaluation is incomplete or noncompliant. Review its required business information before retrying.",
    );
  }
  if (product.status === "draft" || product.status === "twilio-rejected") {
    product = await submitA2pTrustProduct(
      c.twilio,
      productSid,
      {
        workspaceId: c.workspaceId,
        operation: "trusthub.trustProducts.submit",
      },
      c.statusCallback,
    );
  }
  if (
    product.sid !== productSid ||
    !SUBMITTED_STATUSES.some((status) => status === product.status)
  ) {
    throw new Error(
      "A2P Messaging Profile submission was not accepted for review.",
    );
  }
}

export async function prepareA2pMessagingProfile(
  c: PreparationContext,
): Promise<{ trustProductSid: string; messagingProfileEndUserSid: string }> {
  try {
    const requested = getA2pMessagingProfileAttributes(
      c.onboarding.businessProfile,
    );
    if (!c.onboarding.a2p10dlc.trustProductSid && !requested.ok)
      throw new Error(requested.issues.join(" "));
    await persistProfile(c, { messagingProfileStatus: "not_started" });
    const product = await ensureProduct(c);
    const assignments = await listA2pTrustProductEntities(
      c.twilio,
      product.sid,
      {
        workspaceId: c.workspaceId,
        operation: "trusthub.trustProducts.entityAssignments.list",
      },
    );
    const user = await ensureEndUser(c, product, assignments);
    await ensureAssignments(c, product.sid, user.sid, assignments);
    await evaluateAndSubmit(c, product.sid);
    await updateWorkspaceMessagingOnboardingState({
      workspaceId: c.workspaceId,
      actorUserId: c.actorUserId,
      updates: {
        a2p10dlc: {
          messagingProfileStatus: "ready",
          lastSyncedAt: new Date().toISOString(),
        },
      },
      expectedA2pBusinessProfile: c.onboarding.businessProfile,
      expectedA2pResourceSids: {
        trustProductSid: product.sid,
        messagingProfileEndUserSid: user.sid,
      },
    });
    return {
      trustProductSid: product.sid,
      messagingProfileEndUserSid: user.sid,
    };
  } catch (error) {
    await persistProfile(c, { messagingProfileStatus: "action_needed" });
    throw error;
  }
}
