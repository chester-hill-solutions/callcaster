const usageMessage = "usage: npm run config:compare-runtime -- --environment <local|dev|qa|production> [--local-mode standard|dev-local] [--json]";

async function main() {
  const { compareRuntimeConfig } = await import("../config/runtime-compare.ts");
  const { EnvironmentNameSchema } = await import("../config/schema.ts");
  let environment;
  let json = false;
  let localMode = "standard";
  let localModeSupplied = false;
  for (let index = 0; index < process.argv.length - 2; index += 1) {
    const arg = process.argv[index + 2];
    if (arg === "--json") json = true;
    else if (arg === "--local-mode" && process.argv[index + 3]) {
      localModeSupplied = true;
      localMode = process.argv[++index + 2];
    }
    else if (arg === "--environment" && process.argv[index + 3]) environment = process.argv[++index + 2];
    else throw new Error(usageMessage);
  }
  if (!environment) throw new Error(usageMessage);
  const parsed = EnvironmentNameSchema.safeParse(environment);
  if (!parsed.success) throw new Error("unknown environment");
  if (localMode !== "standard" && localMode !== "dev-local") throw new Error(usageMessage);
  if (localModeSupplied && parsed.data !== "local") throw new Error(usageMessage);

  const report = await compareRuntimeConfig(parsed.data, process.env, { localMode });
  process.stdout.write(`${JSON.stringify(report, null, json ? 0 : 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error && error.message === usageMessage
    ? usageMessage
    : error instanceof Error && error.message === "unknown environment"
      ? error.message
      : "runtime config comparison failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
