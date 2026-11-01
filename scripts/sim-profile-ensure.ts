import { createSimRuntimeContext } from "../e2e/sim/runtime-context";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--persona" || !args[1] || args[1].startsWith("--")) {
  console.error("Usage: npm run sim:profile:ensure -- --persona <key>");
  process.exit(2);
}

let context: Awaited<ReturnType<typeof createSimRuntimeContext>> | undefined;
try {
  context = await createSimRuntimeContext({ personaKey: args[1] });
  const { reconcileSimProfileInDatabase } = await import("../app/server/sim-profile-reconciliation.server");
  const { SimReconciliationError } = await import("../app/lib/sim-profile-reconciliation.server");
  const result = await reconcileSimProfileInDatabase(context.profile, context.getCredential);
  console.log(JSON.stringify(result));
} catch (error) {
  if (context && error instanceof Error && error.name === "SimReconciliationError") {
    const status = (error as { status?: string }).status;
    console.log(JSON.stringify({
      status: status === "blocked" || status === "drifted" ? status : "blocked",
      persona: context.profile.personaKey,
      environment: context.profile.environment,
      runtimeIdentity: context.profile.runtimeIdentity,
      email: context.profile.email,
      workspaceMarker: context.profile.workspaceMarker,
      role: context.profile.expectedRole,
    }));
  } else {
    console.error("SIM profile reconciliation failed");
  }
  process.exit(1);
}
