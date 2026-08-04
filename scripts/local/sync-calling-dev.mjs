#!/usr/bin/env node
/* eslint-env node */

import "dotenv/config";

import postgres from "postgres";
import Twilio from "twilio";

const LOCAL_APP_URL = process.env.LOCAL_APP_URL ?? "http://127.0.0.1:3000";
const NGROK_API_URL = process.env.NGROK_API_URL ?? "http://127.0.0.1:4040/api/tunnels";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const baseUrl = await resolveBaseUrl(args.baseUrl);

  await assertReachable({
    label: "Local app",
    url: LOCAL_APP_URL,
  });

  const twimlApp = await syncTwimlApp(baseUrl, {
    allowSharedApp: args.allowSharedApp,
  });
  const workspaceResults = await syncWorkspaceTargets({
    allWorkspaces: args.allWorkspaces,
    workspaceIds: args.workspaceIds,
    baseUrl,
  });

  printSummary({
    baseUrl,
    twimlApp,
    workspaceResults,
  });

  if (workspaceResults.some((result) => result.errors.length > 0)) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const parsed = {
    allWorkspaces: false,
    allowSharedApp: false,
    baseUrl: null,
    help: false,
    workspaceIds: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--all-workspaces":
        parsed.allWorkspaces = true;
        break;
      case "--allow-shared-app":
        parsed.allowSharedApp = true;
        break;
      case "--base-url":
        parsed.baseUrl = argv[index + 1] ?? null;
        if (!parsed.baseUrl) {
          throw new Error("Missing value for --base-url");
        }
        index += 1;
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--workspace-id": {
        const workspaceId = argv[index + 1] ?? null;
        if (!workspaceId) {
          throw new Error("Missing value for --workspace-id");
        }
        parsed.workspaceIds.push(workspaceId);
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (parsed.allWorkspaces && parsed.workspaceIds.length > 0) {
    throw new Error("Use either --all-workspaces or --workspace-id, not both.");
  }

  return parsed;
}

function printHelp() {
  console.log(`
Usage:
  npm run dev:calling:sync -- --workspace-id <workspace-id>
  npm run dev:calling:sync -- --all-workspaces
  npm run dev:calling:sync -- --workspace-id <workspace-id> --base-url https://your-subdomain.loca.lt

The script resolves the public base URL in this order:
  1. --base-url
  2. BASE_URL from the environment
  3. ngrok local API at ${NGROK_API_URL} (fallback only)

For Localtunnel, set BASE_URL in .env or pass --base-url explicitly.

Flags:
  --allow-shared-app  Repoint the TwiML App even when its current voice URL is
                      not a localhost/tunnel URL. Refused by default, because a
                      TwiML App holds one voice URL and repointing a deployed
                      environment's app breaks browser calling for its users.
                      Prefer giving local dev its own TwiML App instead.
`.trim());
}

async function resolveBaseUrl(cliBaseUrl) {
  const candidates = [cliBaseUrl, process.env.BASE_URL];

  for (const candidate of candidates) {
    const normalized = normalizeOptionalBaseUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const discoveredNgrokUrl = await discoverNgrokUrl();
  return normalizeBaseUrl(discoveredNgrokUrl);
}

function normalizeOptionalBaseUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (
    trimmed.includes("your-ngrok-subdomain") ||
    trimmed.includes("your-subdomain.loca.lt") ||
    trimmed.includes("your-subdomain") ||
    trimmed.includes("placeholder")
  ) {
    return null;
  }

  return normalizeBaseUrl(trimmed);
}

function normalizeBaseUrl(value) {
  let parsedUrl;

  try {
    parsedUrl = new URL(value);
  } catch (error) {
    throw new Error(`Invalid base URL: ${value}`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(
      `BASE_URL must use https for Twilio callbacks. Received: ${parsedUrl.href}`,
    );
  }

  parsedUrl.pathname = "";
  parsedUrl.search = "";
  parsedUrl.hash = "";

  return parsedUrl.toString().replace(/\/$/, "");
}

async function discoverNgrokUrl() {
  const response = await fetch(NGROK_API_URL);
  if (!response.ok) {
    throw new Error(
      `Could not reach ngrok local API at ${NGROK_API_URL}. If you are using Localtunnel, pass --base-url or set BASE_URL.`,
    );
  }

  const body = await response.json();
  const tunnels = Array.isArray(body.tunnels) ? body.tunnels : [];
  const httpsTunnel = tunnels.find((tunnel) => tunnel.public_url?.startsWith("https://"));

  if (!httpsTunnel?.public_url) {
    throw new Error(
      `No HTTPS ngrok tunnel found at ${NGROK_API_URL}. If you are using Localtunnel, pass --base-url or set BASE_URL.`,
    );
  }

  return httpsTunnel.public_url;
}

async function assertReachable({ label, url }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 500) {
      throw new Error(`${label} responded with status ${response.status}`);
    }
  } catch (error) {
    throw new Error(`${label} is not reachable at ${url}. Start it before syncing.`);
  } finally {
    clearTimeout(timeout);
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Hosts a local dev tunnel can legitimately live on. A TwiML App already
 * pointing at one of these is someone's dev app and is safe to repoint.
 */
const DEV_TUNNEL_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /\.loca\.lt$/i,
  /\.ngrok\.io$/i,
  /\.ngrok\.app$/i,
  /\.ngrok-free\.app$/i,
  /\.trycloudflare\.com$/i,
  /\.serveo\.net$/i,
];

function isDevTunnelUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  let hostname;
  try {
    hostname = new URL(value).hostname;
  } catch {
    return false;
  }

  return DEV_TUNNEL_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * A TwiML App holds exactly one voice URL, so repointing one that a deployed
 * environment is using silently breaks browser calling for every user of that
 * environment until someone notices. Twilio's only symptom is a spoken
 * "an unexpected error has occurred" (error 11200), which gives no hint at the
 * cause, so refuse rather than rely on the operator spotting it.
 */
async function assertTwimlAppIsSafeToRepoint({ application, appSid, allowSharedApp }) {
  const currentVoiceUrl = application.voiceUrl ?? "";

  if (allowSharedApp || isDevTunnelUrl(currentVoiceUrl)) {
    return;
  }

  throw new Error(
    [
      `Refusing to repoint TwiML App ${appSid} ("${application.friendlyName ?? "unnamed"}").`,
      ``,
      `Its voice URL is currently:`,
      `  ${currentVoiceUrl || "(unset)"}`,
      ``,
      `That is not a localhost or tunnel URL, so a deployed environment is almost`,
      `certainly using this app. Repointing it at your tunnel would break browser`,
      `calling for everyone on that environment, and would keep breaking it after`,
      `your tunnel closes.`,
      ``,
      `Give local dev its own TwiML App and point TWILIO_APP_SID in .env at it:`,
      `  https://console.twilio.com/us1/develop/voice/manage/twiml-apps`,
      ``,
      `If you are certain this app is not shared, re-run with --allow-shared-app.`,
    ].join("\n"),
  );
}

async function syncTwimlApp(baseUrl, { allowSharedApp = false } = {}) {
  const client = new Twilio.Twilio(
    requireEnv("TWILIO_SID"),
    requireEnv("TWILIO_AUTH_TOKEN"),
  );
  const appSid = requireEnv("TWILIO_APP_SID");
  const voiceUrl = `${baseUrl}/api/call`;

  const existing = await client.applications(appSid).fetch();
  await assertTwimlAppIsSafeToRepoint({
    application: existing,
    appSid,
    allowSharedApp,
  });

  const application = await client.applications(appSid).update({
    voiceMethod: "POST",
    voiceUrl,
  });

  return {
    sid: application.sid,
    previousVoiceUrl: existing.voiceUrl ?? null,
    voiceUrl,
  };
}

async function syncWorkspaceTargets({ allWorkspaces, workspaceIds, baseUrl }) {
  if (!allWorkspaces && workspaceIds.length === 0) {
    return [];
  }

  const sql = postgres(requireEnv("DATABASE_URL"));
  try {
    const workspaces = await loadWorkspaces({
      allWorkspaces,
      sql,
      workspaceIds,
    });
    const results = [];

    for (const workspace of workspaces) {
      results.push(await syncWorkspace({ baseUrl, sql, workspace }));
    }

    return results;
  } finally {
    await sql.end();
  }
}

async function loadWorkspaces({ allWorkspaces, sql, workspaceIds }) {
  const rawWorkspaces = allWorkspaces
    ? await sql`SELECT id, name, twilio_data FROM workspace`
    : await sql`SELECT id, name, twilio_data FROM workspace WHERE id = ANY(${workspaceIds})`;

  if (!allWorkspaces) {
    const loadedWorkspaceIds = new Set(rawWorkspaces.map((workspace) => workspace.id));
    const missingWorkspaceIds = workspaceIds.filter((workspaceId) => !loadedWorkspaceIds.has(workspaceId));

    if (missingWorkspaceIds.length > 0) {
      throw new Error(
        `Workspace not found: ${missingWorkspaceIds.join(", ")}`,
      );
    }
  }

  const workspaces = rawWorkspaces
    .filter((workspace) => hasTwilioCredentials(workspace.twilio_data))
    .map((workspace) => ({
      id: workspace.id,
      name: workspace.name ?? workspace.id,
      twilioData: workspace.twilio_data,
    }));

  if (!allWorkspaces) {
    const loadedWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
    const invalidWorkspaceIds = workspaceIds.filter((workspaceId) => !loadedWorkspaceIds.has(workspaceId));

    if (invalidWorkspaceIds.length > 0) {
      throw new Error(
        `Workspace is missing Twilio credentials: ${invalidWorkspaceIds.join(", ")}`,
      );
    }
  }

  return workspaces;
}

function hasTwilioCredentials(twilioData) {
  return Boolean(
    twilioData &&
      typeof twilioData === "object" &&
      typeof twilioData.sid === "string" &&
      twilioData.sid &&
      typeof twilioData.authToken === "string" &&
      twilioData.authToken,
  );
}

async function syncWorkspace({ baseUrl, sql, workspace }) {
  const result = {
    errors: [],
    id: workspace.id,
    missingNumbers: [],
    name: workspace.name,
    syncedNumbers: [],
  };

  try {
    const workspaceClient = new Twilio.Twilio(
      workspace.twilioData.sid,
      workspace.twilioData.authToken,
    );
    const workspaceNumbers = await sql`
      SELECT phone_number FROM workspace_number WHERE workspace = ${workspace.id}
    `;

    const phoneNumbers = Array.isArray(workspaceNumbers) ? workspaceNumbers : [];

    for (const entry of phoneNumbers) {
      const phoneNumber = entry.phone_number;
      if (typeof phoneNumber !== "string" || !phoneNumber) {
        continue;
      }

      const matches = await workspaceClient.incomingPhoneNumbers.list({
        limit: 20,
        phoneNumber,
      });
      const exactMatch = matches.find((candidate) => candidate.phoneNumber === phoneNumber);

      if (!exactMatch) {
        result.missingNumbers.push(phoneNumber);
        continue;
      }

      await workspaceClient.incomingPhoneNumbers(exactMatch.sid).update({
        smsMethod: "POST",
        smsUrl: `${baseUrl}/api/inbound-sms`,
        statusCallback: `${baseUrl}/api/caller-id/status`,
        statusCallbackMethod: "POST",
        voiceMethod: "POST",
        voiceUrl: `${baseUrl}/api/inbound`,
      });

      result.syncedNumbers.push(phoneNumber);
    }

    await updateWorkspaceOnboardingMetadata({
      baseUrl,
      sql,
      workspace,
    });
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

async function updateWorkspaceOnboardingMetadata({ baseUrl, sql, workspace }) {
  const currentTwilioData = workspace.twilioData;
  const onboarding = asRecord(currentTwilioData.onboarding);
  const subaccountBootstrap = asRecord(onboarding.subaccountBootstrap);

  const nextTwilioData = {
    ...currentTwilioData,
    onboarding: {
      ...onboarding,
      subaccountBootstrap: {
        ...subaccountBootstrap,
        callbackBaseUrl: baseUrl,
        inboundSmsUrl: `${baseUrl}/api/inbound-sms`,
        inboundVoiceUrl: `${baseUrl}/api/inbound`,
        lastSyncedAt: new Date().toISOString(),
        statusCallbackUrl: `${baseUrl}/api/caller-id/status`,
      },
    },
  };

  await sql`
    UPDATE workspace
    SET twilio_data = ${JSON.stringify(nextTwilioData)}
    WHERE id = ${workspace.id}
  `;
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function printSummary({ baseUrl, twimlApp, workspaceResults }) {
  console.log("");
  console.log("Calling dev sync complete.");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`TwiML App: ${twimlApp.sid} -> ${twimlApp.voiceUrl}`);

  if (twimlApp.previousVoiceUrl && twimlApp.previousVoiceUrl !== twimlApp.voiceUrl) {
    console.log(`  (was: ${twimlApp.previousVoiceUrl})`);
  }

  if (workspaceResults.length === 0) {
    console.log("Workspace numbers: skipped (no workspace target provided).");
    console.log("");
    console.log(`Remember to keep BASE_URL in .env set to ${baseUrl}`);
    return;
  }

  for (const workspace of workspaceResults) {
    console.log("");
    console.log(`Workspace: ${workspace.name} (${workspace.id})`);
    console.log(`Synced numbers: ${workspace.syncedNumbers.length}`);

    if (workspace.syncedNumbers.length > 0) {
      console.log(`  ${workspace.syncedNumbers.join(", ")}`);
    }

    if (workspace.missingNumbers.length > 0) {
      console.log(`Missing in Twilio: ${workspace.missingNumbers.join(", ")}`);
    }

    if (workspace.errors.length > 0) {
      console.log(`Errors: ${workspace.errors.join(" | ")}`);
    }
  }

  console.log("");
  console.log(`Remember to keep BASE_URL in .env set to ${baseUrl}`);
}

main().catch((error) => {
  console.error("");
  console.error("Calling dev sync failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
