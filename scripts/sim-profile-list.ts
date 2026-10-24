import { resolveSimRuntimeProfile } from "../e2e/sim/runtime-context";
import { simPersonas } from "../e2e/sim/personas";
import { getSimProfileStatusInDatabase } from "../app/lib/sim-profile-status.server";

const args = process.argv.slice(2);
if (args.length !== 0) {
  console.error("Usage: npm run sim:profile:list");
  process.exit(2);
}

try {
  const results = await Promise.all(Object.keys(simPersonas).map(async (personaKey) => {
    const profile = await resolveSimRuntimeProfile({ personaKey });
    return getSimProfileStatusInDatabase(profile);
  }));
  console.log(JSON.stringify(results));
} catch {
  console.error("SIM profile status failed");
  process.exit(1);
}
