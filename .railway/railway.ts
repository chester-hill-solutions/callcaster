import { defineRailway, project } from "railway/iac";
import { devResources } from "./environments/dev.js";
import { productionResources } from "./environments/production.js";
import { stagingResources } from "./environments/staging.js";

export default defineRailway((ctx) => {
  if (ctx.isEnvironment("production")) {
    return project("CallCaster", { resources: productionResources() });
  }
  if (ctx.isEnvironment("staging")) {
    return project("CallCaster", { resources: stagingResources() });
  }
  if (ctx.isEnvironment("dev")) {
    return project("CallCaster", { resources: devResources() });
  }

  // Only `dev`, `staging`, and `production` are modelled. Every other
  // environment — the ephemeral `callcaster-pr-*` review envs — must NOT fall
  // back to the dev topology. Planning one as a dev clone would create dev's
  // services AND delete whatever that environment actually runs: verified
  // 2026-08-07 that `staging` would have destroyed its `hearty-expression`
  // service before it was modelled. Refuse instead of guessing; the CI
  // workflow only ever links modelled environments, so this never blocks an
  // intended apply.
  throw new Error(
    `Railway IaC manages only the 'dev', 'staging', and 'production' ` +
      `environments. Refusing to plan '${ctx.environmentName ?? "unknown"}' ` +
      `to avoid applying it as a dev clone. Model it explicitly in ` +
      `.railway/environments/ before managing it with IaC.`,
  );
});
