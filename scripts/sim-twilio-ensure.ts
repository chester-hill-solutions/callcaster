import { resolveSimRuntimeProfile } from "../e2e/sim/runtime-context";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--persona" || !args[1] || args[1].startsWith("--")) {
  console.error("Usage: npm run sim:twilio:ensure -- --persona <key>");
  process.exit(2);
}
try {
  const profile = await resolveSimRuntimeProfile({ personaKey: args[1] });
  if (profile.environment !== "local" || profile.trafficPolicy !== "local-only" || !/^[a-z0-9-]+-local$/.test(profile.runtimeIdentity) || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.K_SERVICE || process.env.VERCEL || process.env.FLY_APP_NAME || process.env.NODE_ENV === "production") throw new Error("blocked");
  const { ensureSimTwilioInDatabase } = await import("../app/server/sim-twilio-provisioning.server");
  console.log(JSON.stringify(await ensureSimTwilioInDatabase(profile)));
} catch {
  console.error("SIM Twilio ensure failed or was blocked; run sim:twilio:status for redacted state");
  process.exit(1);
}
