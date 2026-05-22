#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const FILES = process.argv.slice(2);
const DB_FN =
  /\b(getUserRole|createNewWorkspace|parseActionRequest|requireWorkspaceAccess|getWorkspaceInfo|getWorkspacePhoneNumbers|getWorkspaceUsers|safeParseJson|createWorkspaceTwilioInstance|acceptWorkspaceInvitations|getInvitesByUserId|checkSchedule|listMedia|parseRequestData|bulkCreateContacts|findPotentialContacts|cancelQueuedMessagesForCampaign|removeContactsFromAudience|removeContactFromAudience|syncWorkspaceTwilioSnapshot|getWorkspaceTwilioPortalSnapshot|updateWorkspacePhoneNumber)\b/g;

function usedDbFns(src) {
  return [...new Set([...src.matchAll(DB_FN)].map((m) => m[1]))];
}

function hasDbImport(fnBody) {
  return /import\s*\(\s*["']@\/lib\/database\.server["']\s*\)/.test(fnBody);
}

function injectDbImport(fnBody, fns) {
  if (fns.length === 0 || hasDbImport(fnBody)) return fnBody;
  const stmt = `  const { ${fns.join(", ")} } = await import("@/lib/database.server");\n`;
  return stmt + fnBody;
}

function patchExport(src, exportName) {
  const re = new RegExp(
    `(export\\s+(?:async\\s+)?function\\s+${exportName}\\s*\\([^)]*\\)\\s*\\{)([\\s\\S]*?)(?=\\nexport\\s|$)`,
  );
  return src.replace(re, (full, head, body) => {
    const fns = usedDbFns(body).filter((fn) => new RegExp(`\\b${fn}\\b`).test(body));
    if (fns.length === 0) return full;
    return head + injectDbImport(body, fns);
  });
}

for (const file of FILES) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  src = patchExport(src, "loader");
  src = patchExport(src, "action");
  if (src !== orig) {
    fs.writeFileSync(file, src);
    console.log(file);
  }
}
