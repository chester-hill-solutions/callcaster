import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.resolve(__dirname, "../.auth");

export const AUTH_PATHS = {
  owner: path.join(AUTH_DIR, "owner.json"),
  admin: path.join(AUTH_DIR, "admin.json"),
  member: path.join(AUTH_DIR, "member.json"),
  caller: path.join(AUTH_DIR, "caller.json"),
  sudo: path.join(AUTH_DIR, "sudo.json"),
  invitee: path.join(AUTH_DIR, "invitee.json"),
} as const;

export type E2ERole = keyof typeof AUTH_PATHS;

export async function signIn(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await page.goto("/signin");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/workspaces/);
}

export function signInAs(page: Page, role: E2ERole): Promise<void> {
  const user = E2E_USERS[role as keyof typeof E2E_USERS];
  if (!user) {
    throw new Error(`Unknown E2E role: ${role}`);
  }
  return signIn(page, user.email);
}

export function roleUser(role: E2ERole) {
  return E2E_USERS[role as keyof typeof E2E_USERS];
}
