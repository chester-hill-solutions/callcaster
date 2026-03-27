#!/usr/bin/env node
import { readdirSync, renameSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve("app/routes");
const DEST = path.resolve("app/routing");

const marketing = new Set([
  "_index.tsx",
  "pricing.tsx",
  "services.tsx",
  "signin.tsx",
  "signup.tsx",
  "remember.tsx",
  "reset.tsx",
  "reset-password.tsx",
  "other-services.tsx",
]);

const publicRoutes = new Set([
  "survey.$surveyId.tsx",
  "accept-invite.tsx",
  "confirm-payment.tsx",
  "auth.confirm.tsx",
]);

function targetDir(name) {
  if (name === "archive") return "legacy";
  if (name.startsWith("api.")) return "api";
  if (name === "api.outreach_attempts.$id.js") return "api";
  if (name.startsWith("admin")) return "admin";
  if (name.startsWith("workspaces")) return "workspace";
  if (name === "workspaces.tsx") return "workspace";
  if (name.startsWith("old.")) return "legacy";
  if (name.startsWith("dashboard")) return "legacy";
  if (marketing.has(name)) return "marketing";
  if (publicRoutes.has(name)) return "public";
  throw new Error(`Unclassified route file: ${name}`);
}

for (const dir of ["api", "workspace", "admin", "marketing", "public", "legacy"]) {
  mkdirSync(path.join(DEST, dir), { recursive: true });
}

for (const entry of readdirSync(SRC)) {
  const full = path.join(SRC, entry);
  const st = statSync(full);
  if (st.isDirectory()) {
    const dir = targetDir(entry);
    renameSync(full, path.join(DEST, dir, entry));
    continue;
  }
  const dir = targetDir(entry);
  renameSync(full, path.join(DEST, dir, entry));
}
