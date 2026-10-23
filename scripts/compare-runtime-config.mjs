const { compareRuntimeConfig } = await import("../config/runtime-compare.ts");
const { EnvironmentNameSchema } = await import("../config/schema.ts");

function usage() {
  throw new Error("usage: npm run config:compare-runtime -- --environment <local|sai-local|dev|qa>");
}

let environment;
let json = false;
for (let index = 0; index < process.argv.length - 2; index += 1) {
  const arg = process.argv[index + 2];
  if (arg === "--json") json = true;
  else if (arg === "--environment" && process.argv[index + 3]) environment = process.argv[++index + 2];
  else usage();
}
if (!environment) usage();
const parsed = EnvironmentNameSchema.safeParse(environment);
if (!parsed.success) throw new Error(`unknown environment '${environment}'`);

const report = compareRuntimeConfig(parsed.data, process.env);
process.stdout.write(`${JSON.stringify(report, null, json ? 0 : 2)}\n`);
