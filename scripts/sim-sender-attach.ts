import { resolveSimRuntimeProfile } from "../e2e/sim/runtime-context";
import { readRuntimeEnvironment } from "../config/runtime-environment";
import { attachSimSenderInDatabase, findSimSenderWorkspace } from "../app/server/sim-sender-attachment.server";
import { createWorkspaceTwilioClient } from "../app/lib/twilio-client.server";
import { env } from "../app/lib/env.server";

function args(argv: string[]) {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (flag === "--compliance-attested") result[flag] = true;
    else if (["--persona", "--phone"].includes(flag)) result[flag] = argv[++i] ?? "";
    else throw new Error("Unsupported argument");
  }
  if (!result["--persona"] || !result["--phone"] || !result["--compliance-attested"]) throw new Error("Usage: npm run sim:sender:attach -- --persona <key> --phone <E.164> --compliance-attested");
  return result as { "--persona": string; "--phone": string; "--compliance-attested": boolean };
}

async function main() {
  const input = args(process.argv.slice(2));
  const profile = await resolveSimRuntimeProfile({ personaKey: input["--persona"], runtimeEnvironment: await readRuntimeEnvironment() });
  if (profile.environment !== "local" || !["person-a", "person-b"].includes(profile.personaKey)) throw new Error("Only approved local SIM personas are allowed");
  const workspace = await findSimSenderWorkspace(profile);
  const twilio = await createWorkspaceTwilioClient({ workspaceId: workspace.id });
  const candidates = await twilio.incomingPhoneNumbers.list({ phoneNumber: input["--phone"] });
  const providerRows = candidates.map((row) => ({ sid: row.sid, accountSid: row.accountSid, phoneNumber: row.phoneNumber, friendlyName: row.friendlyName ?? null, capabilities: { sms: Boolean(row.capabilities.sms), mms: Boolean(row.capabilities.mms), voice: Boolean(row.capabilities.voice), fax: Boolean(row.capabilities.fax) } }));
  const result = await attachSimSenderInDatabase(profile, input["--phone"], env.TWILIO_PHONE_NUMBER(), providerRows);
  console.log(JSON.stringify({ status: result.status, persona: profile.personaKey, workspaceMarker: result.workspaceMarker, phoneLast4: result.phoneLast4, capabilities: result.capabilities }));
  console.log("Operator attestation recorded by flag only. Separately confirm traffic compliance; provider capabilities do not prove compliance.");
}

main().catch(() => { console.error("SIM sender attachment blocked. No full number or provider ID was printed."); process.exitCode = 1; });
