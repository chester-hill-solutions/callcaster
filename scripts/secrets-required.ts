import {
  planRequiredSecrets,
  secretsRequiredEnvironmentNames,
  secretsRequiredProviderNames,
  secretsRequiredServiceNames,
} from "../config/secrets-required";

const usage = "usage: npm run secrets:required -- --environment <local|dev|qa|production> --service <app|worker|media-stream|sim> [--provider <dotenv|password-manager|railway>]";

function fail(message: string): never {
  throw new Error(`${message}\n${usage}`);
}

function parseArgs(args: string[]) {
  let environment: string | undefined;
  let service: string | undefined;
  let provider: string | undefined;
  const seen = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === undefined) fail("missing argument");
    if (flag !== "--environment" && flag !== "--service" && flag !== "--provider") {
      fail(flag.startsWith("--") ? `unknown or duplicate flag '${flag}'` : "positional arguments are not supported");
    }
    if (seen.has(flag)) fail(`duplicate flag '${flag}'`);
    seen.add(flag);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) fail(`missing value for '${flag}'`);
    index += 1;
    if (flag === "--environment") environment = value;
    else if (flag === "--service") service = value;
    else provider = value;
  }

  if (environment === undefined) fail("missing required flag '--environment'");
  if (service === undefined) fail("missing required flag '--service'");
  if (!(secretsRequiredEnvironmentNames as readonly string[]).includes(environment)) fail("unknown environment");
  if (!(secretsRequiredServiceNames as readonly string[]).includes(service)) fail("unknown service");
  if (provider !== undefined && !(secretsRequiredProviderNames as readonly string[]).includes(provider)) {
    fail("unknown provider");
  }
  return { environment, service, provider } as Parameters<typeof planRequiredSecrets>[0];
}

function main() {
  const input = parseArgs(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(planRequiredSecrets(input))}\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "invalid arguments";
  process.stderr.write(`secrets:required: ${message}${message.includes("usage:") ? "" : `\n${usage}`}\n`);
  process.exitCode = 1;
}
