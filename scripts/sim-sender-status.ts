import { resolveSimRuntimeProfile } from "../e2e/sim/runtime-context";
import { readRuntimeEnvironment } from "../config/runtime-environment";
import { getSimSenderStatusInDatabase } from "../app/server/sim-sender-attachment.server";

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 2 || argv[0] !== "--persona") throw new Error("Usage: npm run sim:sender:status -- --persona <key>");
  const profile = await resolveSimRuntimeProfile({ personaKey: argv[1]!, runtimeEnvironment: await readRuntimeEnvironment() });
  if (profile.environment !== "local" || !["person-a", "person-b"].includes(profile.personaKey)) throw new Error("Only approved local SIM personas are allowed");
  const status = await getSimSenderStatusInDatabase(profile);
  console.log(JSON.stringify({ ...status, persona: profile.personaKey, workspaceMarker: profile.workspaceMarker }));
}
main().catch(() => { console.error("SIM sender status failed"); process.exitCode = 1; });
