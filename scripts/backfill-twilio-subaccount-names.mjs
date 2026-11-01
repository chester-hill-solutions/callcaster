#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  applyNameBackfillPlan,
  createOwnershipReader,
  NameBackfillError,
  readNameBackfillPlan,
} from "./lib/twilio-subaccount-name-backfill.mjs";

const HELP = `Backfill legacy workspace subaccount names (dry-run by default).

bun scripts/backfill-twilio-subaccount-names.mjs --environment dev \\
  --database dev=CC_DEV_DATABASE_URL --database qa=CC_QA_DATABASE_URL \\
  --database production=CC_PRODUCTION_DATABASE_URL > reviewed-plan.json

Use --apply reviewed-plan.json to apply only the reviewed renames.
All database arguments name environment variables, never connection strings.
Include every other database that can reference this shared Twilio account.
Production is a read-only ownership source; targets are dev or qa.
Requires TWILIO_SID and TWILIO_AUTH_TOKEN, or a Main API key in
TWILIO_API_KEY / TWILIO_API_SECRET. No numbers, keys or account status change.
`;

export function parseBackfillArguments(args, env) {
  const options = { databases: [] };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (
      !["--environment", "--database", "--apply"].includes(flag) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new NameBackfillError(
        "Use --environment, --database or --apply with a value; see --help",
      );
    const value = args[++i];
    if (flag === "--database") {
      const match = /^([a-z][a-z0-9-]*)=([A-Z_][A-Z0-9_]*)$/.exec(value);
      if (!match || options.databases.some((d) => d.environment === match[1]))
        throw new NameBackfillError(
          "Use one --database environment=VARIABLE_NAME per source",
        );
      const url = env[match[2]];
      if (!url)
        throw new NameBackfillError(`Database variable ${match[2]} is not set`);
      options.databases.push({ environment: match[1], url });
    } else {
      const key = flag === "--environment" ? "environment" : "apply";
      if (options[key]) throw new NameBackfillError(`Duplicate ${flag}`);
      options[key] = value;
    }
  }
  if (!["dev", "qa"].includes(options.environment))
    throw new NameBackfillError("Select --environment dev or qa");
  if (
    ["dev", "qa", "production"].some(
      (name) => !options.databases.some((d) => d.environment === name),
    )
  )
    throw new NameBackfillError(
      "Provide dev, qa and production ownership databases",
    );
  return options;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(HELP);
    return;
  }
  let reader;
  const applied = [];
  try {
    const options = parseBackfillArguments(args, process.env);
    const approved = options.apply
      ? JSON.parse(await readFile(options.apply, "utf8"))
      : null;
    if (options.apply && approved?.environment !== options.environment)
      throw new NameBackfillError(
        "Reviewed target does not match --environment",
      );
    const {
      TWILIO_SID: sid,
      TWILIO_AUTH_TOKEN: token,
      TWILIO_API_KEY: key,
      TWILIO_API_SECRET: secret,
    } = process.env;
    if (
      !sid ||
      (!token && !(key && secret)) ||
      Boolean(key) !== Boolean(secret)
    )
      throw new NameBackfillError(
        "Set the parent Twilio credentials in the environment",
      );
    const { default: Twilio } = await import("twilio");
    const client = new Twilio.Twilio(key || sid, key ? secret : token, {
      accountSid: sid,
    });
    reader = createOwnershipReader(options.databases);
    const readSources = () => reader.read();
    const result = options.apply
      ? await applyNameBackfillPlan({
          client,
          readSources,
          approved,
          onApplied: (entry) => {
            applied.push(entry);
            process.stderr.write(JSON.stringify(entry) + "\n");
          },
        })
      : await readNameBackfillPlan({
          client,
          readSources,
          environment: options.environment,
        });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error:
          error instanceof NameBackfillError
            ? error.message
            : "Backfill stopped. Check database access, Main API permissions and provider state before retrying.",
        applied,
      }),
    );
    process.exitCode = 1;
  } finally {
    await reader?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
