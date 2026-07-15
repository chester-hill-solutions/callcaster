import twilio from "twilio";

/**
 * Per-environment TwiML App provisioning for non-production deployments.
 *
 * A TwiML App holds exactly one voice URL, but every deployment has its own
 * hostname, so a single shared app cannot serve more than one environment.
 * Railway clones variables when it creates an environment, so a deployment
 * inherits whatever TWILIO_APP_SID its base environment carries — and only
 * production owns an app. Left alone, a non-production deployment mints Voice
 * SDK tokens against that inherited app, and Twilio then fetches TwiML from
 * production: the call runs against production's code, database and caller ID
 * while the deployment's own build is never exercised.
 *
 * Provisioning an app per environment at boot keeps deployments self-contained.
 * The inherited SID is deliberately overridden rather than respected, because
 * "already set" is the broken case, not the configured one.
 */

const ENVIRONMENT_APP_PREFIX = "env:";
const PRODUCTION_ENVIRONMENT_NAME = "production";

export function environmentTwimlAppName(environmentName: string): string {
  return `${ENVIRONMENT_APP_PREFIX}${environmentName}`;
}

/** Production owns its app explicitly; every other Railway environment is managed here. */
export function isManagedEnvironment(env: NodeJS.ProcessEnv): boolean {
  const name = env.RAILWAY_ENVIRONMENT_NAME?.trim();
  return Boolean(name) && name !== PRODUCTION_ENVIRONMENT_NAME;
}

export type EnvironmentTwimlAppResult =
  | { status: "skipped"; reason: string }
  | { status: "provisioned"; sid: string; friendlyName: string; voiceUrl: string; created: boolean };

/**
 * Point this environment at its own TwiML App, creating one if needed, and
 * assign the SID to `env.TWILIO_APP_SID`.
 *
 * Must run before `validateEnvironment`, which requires TWILIO_APP_SID.
 *
 * Throws on failure rather than falling back to the inherited SID: booting a
 * deployment that silently places calls through production is worse than not
 * booting it.
 */
export async function ensureEnvironmentTwimlApp(
  env: NodeJS.ProcessEnv = process.env,
): Promise<EnvironmentTwimlAppResult> {
  const environmentName = env.RAILWAY_ENVIRONMENT_NAME?.trim();

  if (!environmentName) {
    return { status: "skipped", reason: "not a Railway deployment" };
  }
  if (!isManagedEnvironment(env)) {
    return { status: "skipped", reason: "production uses its explicit TWILIO_APP_SID" };
  }

  const accountSid = env.TWILIO_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const baseUrl = env.BASE_URL?.replace(/\/+$/, "");

  // validateEnvironment reports these properly a moment later; don't pre-empt it
  // with a worse error message.
  if (!accountSid || !authToken || !baseUrl) {
    return { status: "skipped", reason: "Twilio credentials or BASE_URL not configured" };
  }

  const friendlyName = environmentTwimlAppName(environmentName);
  const voiceUrl = `${baseUrl}/api/call`;
  const client = twilio(accountSid, authToken);

  try {
    const [existing] = await client.applications.list({ friendlyName, limit: 1 });

    const application = existing
      ? await client.applications(existing.sid).update({ voiceUrl, voiceMethod: "POST" })
      : await client.applications.create({ friendlyName, voiceUrl, voiceMethod: "POST" });

    env.TWILIO_APP_SID = application.sid;

    return {
      status: "provisioned",
      sid: application.sid,
      friendlyName,
      voiceUrl,
      created: !existing,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to provision TwiML App "${friendlyName}" for environment ` +
        `"${environmentName}": ${message}. Refusing to boot with the inherited ` +
        `TWILIO_APP_SID, which would route this environment's calls through production.`,
    );
  }
}
