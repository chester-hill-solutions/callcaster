#!/usr/bin/env node
/* eslint-env node */

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
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

  const twimlApp = await syncTwimlApp(baseUrl);
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

async function syncTwimlApp(baseUrl) {
  const client = new Twilio.Twilio(
    requireEnv("TWILIO_SID"),
    requireEnv("TWILIO_AUTH_TOKEN"),
  );
  const appSid = requireEnv("TWILIO_APP_SID");
  const voiceUrl = `${baseUrl}/api/call`;

  const application = await client.applications(appSid).update({
    voiceMethod: "POST",
    voiceUrl,
  });

  return {
    sid: application.sid,
    voiceUrl,
  };
}

async function syncWorkspaceTargets({ allWorkspaces, workspaceIds, baseUrl }) {
  if (!allWorkspaces && workspaceIds.length === 0) {
    return [];
  }

  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_KEY"),
  );
  const workspaces = await loadWorkspaces({
    allWorkspaces,
    supabase,
    workspaceIds,
  });
  const results = [];

  for (const workspace of workspaces) {
    results.push(await syncWorkspace({ baseUrl, supabase, workspace }));
  }

  return results;
}

async function loadWorkspaces({ allWorkspaces, supabase, workspaceIds }) {
  const query = supabase.from("workspace").select("id, name, twilio_data");
  const response = allWorkspaces
    ? await query
    : await query.in("id", workspaceIds);

  if (response.error) {
    throw response.error;
  }

  const rawWorkspaces = Array.isArray(response.data) ? response.data : [];

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

async function syncWorkspace({ baseUrl, supabase, workspace }) {
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
    const { data: workspaceNumbers, error } = await supabase
      .from("workspace_number")
      .select("phone_number")
      .eq("workspace", workspace.id);

    if (error) {
      throw error;
    }

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
      supabase,
      workspace,
    });
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

async function updateWorkspaceOnboardingMetadata({ baseUrl, supabase, workspace }) {
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

  const { error } = await supabase
    .from("workspace")
    .update({ twilio_data: nextTwilioData })
    .eq("id", workspace.id);

  if (error) {
    throw error;
  }
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
