#!/usr/bin/env node
/**
 * Fix common module-scope server symbol references after dynamic-import migration.
 * Run after route-dynamic-server-imports; safe to re-run (idempotent-ish).
 */
import fs from "node:fs";

const fixes = [
  {
    file: "app/routes/api+/auto-dial/$roomId.route.tsx",
    from: "const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());",
    to: `const getSupabase = async () => {
  const { env } = await import("@/lib/env.server");
  return createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
};`,
    injectSupabaseInAsyncFns: true,
  },
  {
    file: "app/routes/api+/auto-dial/status.route.tsx",
    from: `const supabase = createClient(
  env.SUPABASE_URL(),
  env.SUPABASE_SERVICE_KEY(),
);`,
    to: `const getSupabase = async () => {
  const { env } = await import("@/lib/env.server");
  return createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
};`,
    injectSupabaseInAsyncFns: true,
  },
];

function injectSupabaseConst(src) {
  const fnRe =
    /((?:export\s+)?(?:const\s+\w+\s*=\s*)?async\s+(?:function\s+\w+|\([^)]*\)\s*=>))\s*\{/g;
  return src.replace(fnRe, (m) => {
    if (m.includes("getSupabase")) return m;
    return `${m}\n  const supabase = await getSupabase();`;
  });
}

for (const { file, from, to, injectSupabaseInAsyncFns } of fixes) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes(from)) continue;
  src = src.replace(from, to);
  if (injectSupabaseInAsyncFns) {
    src = injectSupabaseConst(src);
  }
  fs.writeFileSync(file, src);
  console.log("fixed", file);
}
