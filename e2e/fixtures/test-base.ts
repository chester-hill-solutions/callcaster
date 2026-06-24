import { test as base } from "@playwright/test";
import { AUTH_PATHS } from "./auth";
import type { E2ERole } from "./auth";

export function testAs(role: E2ERole) {
  return base.extend({
    storageState: AUTH_PATHS[role],
  });
}

export const ownerTest = testAs("owner");
export const adminTest = testAs("admin");
export const memberTest = testAs("member");
export const callerTest = testAs("caller");
export const sudoTest = testAs("sudo");

export { test, expect } from "@playwright/test";
