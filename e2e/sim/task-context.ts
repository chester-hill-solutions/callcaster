import type { SimRuntimeContext } from "./runtime-context";
import type { ProjectConfig } from "../../config/schema";
import type { ResolvedSimProfile } from "./personas";

export type SimTaskCapability =
  | "workspace.read"
  | "billing.purchaseTestCredits"
  | "audience.write"
  | "message.send";

export type SimTaskRole = "member" | "owner";

export type SimTaskRequirement = Readonly<{
  workspaceRole: SimTaskRole;
  capabilities: readonly SimTaskCapability[];
}>;

export type SimTaskContext = Readonly<{
  profile: ResolvedSimProfile;
  /** Non-secret runtime projection. The credential accessor is sign-in-only. */
  runtime: Readonly<Pick<SimRuntimeContext, "profile" | "providerName">>;
  workspaceId: string;
  flow: "sms-send";
}>;

export type SimSignInTaskContext = Omit<SimTaskContext, "runtime"> &
  Readonly<{
    runtime: SimRuntimeContext;
  }>;

export type SimSmsTaskInput = Readonly<{
  recipient: Readonly<{ name: string; phone: string }>;
  message: string;
  checkoutProvider: ProjectConfig["services"]["app"]["checkoutProvider"];
  stripe: Readonly<{ cardNumber: string; expiry: string; cvc: string }>;
}>;

export const simTaskDefinitions = Object.freeze({
  signIn: {
    name: "sign-in",
    requires: { workspaceRole: "member", capabilities: ["workspace.read"] },
  },
  contactList: {
    name: "upload-contact-list",
    requires: { workspaceRole: "member", capabilities: ["audience.write"] },
  },
  credits: {
    name: "ensure-sms-credits",
    requires: {
      workspaceRole: "owner",
      capabilities: ["billing.purchaseTestCredits"],
    },
  },
  sms: {
    name: "send-sms",
    requires: { workspaceRole: "member", capabilities: ["message.send"] },
  },
} as const satisfies Record<
  string,
  Readonly<{ name: string; requires: SimTaskRequirement }>
>);

export function assertTaskRequirement(
  context: Pick<SimTaskContext, "profile">,
  requirement: SimTaskRequirement,
): void {
  const roleRank = { member: 1, owner: 2 } as const;
  if (
    roleRank[context.profile.expectedRole] < roleRank[requirement.workspaceRole]
  ) {
    throw new Error(
      `SIM task access denied: ${requirement.workspaceRole} role is required`,
    );
  }
  for (const capability of requirement.capabilities) {
    if (!context.profile.capabilities.includes(capability)) {
      throw new Error(
        `SIM task access denied: capability '${capability}' is not declared`,
      );
    }
  }
}

export function createSimTaskContext(args: {
  runtime: SimRuntimeContext;
  workspaceId: string;
  flow?: "sms-send";
}): SimTaskContext {
  const context = {
    profile: args.runtime.profile,
    runtime: Object.freeze({
      profile: args.runtime.profile,
      providerName: args.runtime.providerName,
    }),
    workspaceId: args.workspaceId,
    flow: args.flow ?? "sms-send",
  } as const;
  return Object.freeze(context);
}
