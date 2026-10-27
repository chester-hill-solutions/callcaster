import { resolveSimRuntimeProfile } from "../e2e/sim/runtime-context";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--persona" || !args[1] || args[1].startsWith("--")) {
  console.error("Usage: npm run sim:twilio:status -- --persona <key>");
  process.exit(2);
}
try {
  const profile = await resolveSimRuntimeProfile({ personaKey: args[1] });
  const { getSimTwilioStatusInDatabase } = await import("../app/server/sim-twilio-provisioning.server");
  console.log(JSON.stringify(await getSimTwilioStatusInDatabase(profile)));
} catch {
  console.error("SIM Twilio status failed");
  process.exit(1);
}
