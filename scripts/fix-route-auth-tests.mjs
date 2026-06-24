#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const testDir = path.resolve("test");
const helperImport =
  'import { queueDualAuthSession, setDualAuthSession, queueJsonAuthSession, setJsonAuthSession, queueSudoAuth, setSudoAuth } from "./helpers/route-auth-mock";';

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  if (!content.includes("verifyAuth")) {
    return false;
  }

  const isAdminApi =
    filePath.includes("admin-workspace-twilio") ||
    (filePath.includes("admin") && content.includes("api+/admin"));
  const isJsonAuthOnly =
    filePath.includes("dial.route") ||
    filePath.includes("hangup.route") ||
    filePath.includes("initiate-ivr") ||
    filePath.includes("ivr.route") ||
    filePath.includes("agent-status") ||
    filePath.includes("token.route") ||
    filePath.includes("handset");

  const queueFn = isAdminApi
    ? "queueSudoAuth"
    : isJsonAuthOnly
      ? "queueJsonAuthSession"
      : "queueDualAuthSession";
  const setFn = isAdminApi
    ? "setSudoAuth"
    : isJsonAuthOnly
      ? "setJsonAuthSession"
      : "setDualAuthSession";

  if (
    (content.includes("mocks.verifyAuth") || content.includes("verifyAuth.mock")) &&
    !content.includes("route-auth-mock")
  ) {
    const routeResultImport =
      'import { asRouteResponse } from "./helpers/route-result";';
    if (content.includes(routeResultImport)) {
      content = content.replace(
        routeResultImport,
        `${routeResultImport}\n${helperImport}`,
      );
    } else {
      content = content.replace(
        /from "vitest";\n/,
        `from "vitest";\n${helperImport}\n`,
      );
    }
  }

  content = content.replace(
    /mocks\.verifyAuth\.mockResolvedValueOnce\(/g,
    `${queueFn}(`,
  );
  content = content.replace(
    /mocks\.verifyAuth\.mockResolvedValue\(/g,
    `${setFn}(`,
  );
  content = content.replace(/    mocks\.verifyAuth\.mockReset\(\);\n/g, "");
  content = content.replace(/    verifyAuth\.mockClear\(\);\n/g, "");

  if (isJsonAuthOnly) {
    content = content.replace(
      /mocks\.createSupabaseServerClient\.mockReturnValue(?:Once)?\(\{ supabaseClient: ([^,}]+)[^}]*\}\);/g,
      (match, supabaseExpr) => {
        return match;
      },
    );
  }

  fs.writeFileSync(filePath, content);
  return true;
}

const files = fs
  .readdirSync(testDir, { recursive: true })
  .filter((f) => typeof f === "string" && f.endsWith(".test.ts"))
  .map((f) => path.join(testDir, f));

let patched = 0;
for (const file of files) {
  if (patchFile(file)) {
    patched += 1;
    console.log("patched", path.relative(process.cwd(), file));
  }
}

console.log(`patched ${patched} files`);
