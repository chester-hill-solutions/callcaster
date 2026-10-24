import {
  checkSimProfileAccessInDatabase,
  getSimProfileStatusInDatabase,
  type SimProfileAccessResult,
  type SimProfileStatusResult,
} from "../../app/lib/sim-profile-status.server";
import type { SimRuntimeContext } from "./runtime-context";
import { createSimTaskContext, simTaskDefinitions, type SimTaskContext } from "./task-context";

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

/** Resolve and validate the complete SMS flow before any browser navigation. */
export async function prepareSimSmsTaskContext(
  runtime: SimRuntimeContext,
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

  for (const definition of Object.values(simTaskDefinitions)) {
    for (const capability of definition.requires.capabilities) {
      const result = await checks.access(runtime.profile, capability, "sms-send");
      if (!result.allowed) {
        throw new Error(`SIM task '${definition.name}' is not allowed (${result.reason})`);
      }
    }
  }

  return createSimTaskContext({ runtime, workspaceId: status.workspaceId });
}
