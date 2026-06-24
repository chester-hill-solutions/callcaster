import { mkdirSync } from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { AUTH_PATHS, signInAs } from "../fixtures/auth";
import type { E2ERole } from "../fixtures/auth";

const roles: E2ERole[] = ["owner", "admin", "member", "caller", "sudo", "invitee"];

setup("authenticate all roles", async ({ page }) => {
  mkdirSync(path.dirname(AUTH_PATHS.owner), { recursive: true });

  for (const role of roles) {
    await signInAs(page, role);
    await page.context().storageState({ path: AUTH_PATHS[role] });
    await page.context().clearCookies();
  }
});
