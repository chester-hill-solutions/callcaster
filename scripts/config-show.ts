import { loadResolvedConfig } from "../config/resolved";
import { EnvironmentNameSchema } from "../config/schema";

function usage(): never {
  throw new Error("usage: npm run config:show -- --environment <local|sai-local|dev|qa|production> [--json]");
}

function parseArgs(args: string[]): { environment: string; json: boolean } {
  let environment: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--environment" && args[index + 1] !== undefined) {
      environment = args[++index];
    } else {
      usage();
    }
  }
  if (environment === undefined) usage();
  return { environment, json };
}

try {
  const { environment, json } = parseArgs(process.argv.slice(2));
  const parsed = EnvironmentNameSchema.safeParse(environment);
  if (!parsed.success) throw new Error(`unknown environment '${environment}'`);
  const report = loadResolvedConfig(parsed.data);
  process.stdout.write(`${JSON.stringify(report, null, json ? 0 : 2)}\n`);
} catch (error) {
  process.stderr.write(`config:show: ${error instanceof Error ? error.message : "could not resolve configuration"}\n`);
  process.exitCode = 1;
}
