#!/usr/bin/env node
/* eslint-env node */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES = path.join(ROOT, "app/routes");

const MOVES = [
  ["admin.tsx", "admin+/index.tsx"],
  ["admin.fixed.tsx", "admin+/fixed.tsx"],
  ["admin_.users.$userId.edit.tsx", "admin+/users/$userId/edit.route.tsx"],
  ["admin_.users.$userId.workspaces.tsx", "admin+/users/$userId/workspaces.route.tsx"],
  ["admin_.workspaces.$workspaceId.tsx", "admin+/workspaces/$workspaceId.route.tsx"],
  [
    "admin_.workspaces.$workspaceId.campaigns.tsx",
    "admin+/workspaces/$workspaceId/campaigns.route.tsx",
  ],
  [
    "admin_.workspaces.$workspaceId.twilio.tsx",
    "admin+/workspaces/$workspaceId/twilio.route.tsx",
  ],
  [
    "admin_.workspaces.$workspaceId.users.tsx",
    "admin+/workspaces/$workspaceId/users.route.tsx",
  ],
  [
    "admin_.workspaces.$workspaceId_.invite.tsx",
    "admin+/workspaces/$workspaceId/invite.route.tsx",
  ],
];

for (const [from, to] of MOVES) {
  const src = path.join(ROUTES, from);
  const dest = path.join(ROUTES, to);
  if (!fs.existsSync(src)) {
    console.warn(`skip missing: ${from}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
  console.log(`${from} → ${to}`);
}

console.log("admin hybrid migration done");
