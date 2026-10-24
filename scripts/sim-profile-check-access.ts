import { resolveSimRuntimeProfile } from "../e2e/sim/runtime-context";
import { checkSimProfileAccessInDatabase, SIM_CAPABILITIES } from "../app/lib/sim-profile-status.server";

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--persona" || !args[1] || args[1].startsWith("--") || args[2] !== "--capability" || !args[3] || args[3].startsWith("--")) {
  console.error("Usage: npm run sim:profile:check-access -- --persona <key> --capability <known-capability>");
  process.exit(2);
}
if (!SIM_CAPABILITIES.includes(args[3])) {
  console.error("Unknown SIM capability");
  process.exit(2);
}

try {
  const profile = await resolveSimRuntimeProfile({ personaKey: args[1] });
  console.log(JSON.stringify(await checkSimProfileAccessInDatabase(profile, args[3])));
} catch {
  console.error("SIM profile access check failed");
  process.exit(1);
}
