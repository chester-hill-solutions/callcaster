#!/usr/bin/env node
/**
 * Fix common module-scope server symbol references after dynamic-import migration.
 * Run after route-dynamic-server-imports; safe to re-run (idempotent-ish).
 */
import fs from "node:fs";

const fixes = [
  {
    file: "app/routes/api+/auto-dial/$roomId.route.tsx",
    from: "const client = createClient(env.BASE_URL(), env.BASE_URL());",
    to: `const getAdmin = async () => {
  const { env } = await import("@/lib/env.server");
  return createClient(env.BASE_URL(), env.BASE_URL());
};`,
    injectPostgresInAsyncFns: true,
  },
  {
    file: "app/routes/api+/auto-dial/status.route.tsx",
    from: `const client = createClient(
  env.BASE_URL(),
  env.BASE_URL(),
);`,
    to: `const getAdmin = async () => {
  const { env } = await import("@/lib/env.server");
  return createClient(env.BASE_URL(), env.BASE_URL());
};`,
    injectPostgresInAsyncFns: true,
  },
];

function injectPostgresConst(src) {
  const fnRe =
    /((?:export\s+)?(?:const\s+\w+\s*=\s*)?async\s+(?:function\s+\w+|\([^)]*\)\s*=>))\s*\{/g;
  return src.replace(fnRe, (m) => {
    if (m.includes("getAdmin")) return m;
    return `${m}\n  const client = await getAdmin();`;
  });
}

for (const { file, from, to, injectPostgresInAsyncFns } of fixes) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes(from)) continue;
  src = src.replace(from, to);
  if (injectPostgresInAsyncFns) {
    src = injectPostgresConst(src);
  }
  fs.writeFileSync(file, src);
  console.log("fixed", file);
}
