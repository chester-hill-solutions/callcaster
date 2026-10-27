import {
  checkSimProfileAccessInDatabase,
  getSimProfileStatusInDatabase,
  type SimProfileAccessResult,
  type SimProfileStatusResult,
} from "../../app/server/sim-profile-status.server";
import type { SimRuntimeContext } from "./runtime-context";
import { createSimTaskContext, simTaskDefinitions, type SimTaskContext } from "./task-context";

export type SimSmsTaskName = keyof typeof simTaskDefinitions;

export type SimSmsTaskContexts = Readonly<{
  owner: SimTaskContext;
  member: SimTaskContext;
}>;

type ReadOnlyChecks = Readonly<{
  status: (profile: SimRuntimeContext["profile"]) => Promise<SimProfileStatusResult>;
  access: (
    profile: SimRuntimeContext["profile"],
    capability: string,
    flow: string,
  ) => Promise<SimProfileAccessResult>;
}>;

const databaseChecks: ReadOnlyChecks = {
  status: getSimProfileStatusInDatabase,
  access: (profile, capability, flow) => checkSimProfileAccessInDatabase(profile, capability, flow),
};

/** Resolve and validate one persona's assigned tasks before browser navigation. */
export async function prepareSimTaskContext(
  runtime: SimRuntimeContext,
  taskNames: readonly SimSmsTaskName[],
  checks: ReadOnlyChecks = databaseChecks,
): Promise<SimTaskContext> {
  if (runtime.profile.environment === "production") {
    throw new Error("SIM SMS flow is not allowed in production");
  }
  if (runtime.profile.trafficPolicy === "disabled") {
    throw new Error("SIM SMS flow is disabled by the traffic policy");
  }

  const status = await checks.status(runtime.profile);
  if (status.status !== "ready" || !status.workspaceId) {
    throw new Error(`SIM profile is not ready (${status.status})`);
  }

  for (const taskName of taskNames) {
    const definition = simTaskDefinitions[taskName];
    for (const capability of definition.requires.capabilities) {
      const result = await checks.access(runtime.profile, capability, "sms-send");
      if (!result.allowed) {
        throw new Error(`SIM task '${definition.name}' is not allowed (${result.reason})`);
      }
    }
  }

  return createSimTaskContext({ runtime, workspaceId: status.workspaceId });
}

/** Preflight the owner and member sides of SMS without sharing a login session. */
export async function prepareSimSmsTaskContexts(
  runtimes: Readonly<{ owner: SimRuntimeContext; member: SimRuntimeContext }>,
  checks: ReadOnlyChecks = databaseChecks,
): Promise<SimSmsTaskContexts> {
  const [owner, member] = await Promise.all([
    prepareSimTaskContext(runtimes.owner, ["signIn", "credits"], checks),
    prepareSimTaskContext(runtimes.member, ["signIn", "contactList", "sms"], checks),
  ]);
  if (owner.workspaceId !== member.workspaceId) {
    throw new Error("SIM SMS personas must resolve to the same workspace");
  }
  return Object.freeze({ owner, member });
}
