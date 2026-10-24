import { resolveSimRuntimeProfile } from "../e2e/sim/runtime-context";
import { getSimProfileStatusInDatabase } from "../app/lib/sim-profile-status.server";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--persona" || !args[1] || args[1].startsWith("--")) {
  console.error("Usage: npm run sim:profile:status -- --persona <key>");
  process.exit(2);
}

try {
  const profile = await resolveSimRuntimeProfile({ personaKey: args[1] });
  console.log(JSON.stringify(await getSimProfileStatusInDatabase(profile)));
} catch {
  console.error("SIM profile status failed");
  process.exit(1);
}
