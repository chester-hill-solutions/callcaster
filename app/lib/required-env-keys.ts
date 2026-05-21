import {
  REQUIRED_ENV_KEYS as REQUIRED_ENV_KEYS_LIST,
  validateRequiredEnv as validateRequiredEnvImpl,
} from "./required-env-keys.mjs";

/** Required process.env keys for server boot (shared with server/index.js). */
export const REQUIRED_ENV_KEYS = REQUIRED_ENV_KEYS_LIST as readonly RequiredEnvKey[];

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

export function validateRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  validateRequiredEnvImpl(env);
}
