/**
 * Server-side logging utility
 *
 * Delegates the shared logging behaviour to `logger-core` and supplies the
 * server-side development probe.
 *
 * Deployed environments emit single-line JSON so logs are queryable (filter on
 * `message`, `requestId`, `workspaceId`, …); local development keeps the
 * readable positional output.
 *
 * Usage:
 *   import { logger } from '@/lib/logger.server';
 *   logger.debug('Debug message');
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message', error);
 */

import { createLogger, type Logger } from "./logger-core";

const isDevelopment = process.env.NODE_ENV === "development";

type RequestIdGlobal = typeof globalThis & {
  __callcasterRequestIdProvider?: () => string | undefined;
};

/**
 * The ambient request id, as a first-class field rather than a trailing
 * positional argument — so it survives JSON folding and cannot be mistaken for
 * one of the caller's own values.
 */
function requestContextFields(): Record<string, unknown> | undefined {
  const requestId = (globalThis as RequestIdGlobal)
    .__callcasterRequestIdProvider?.();
  return requestId ? { requestId } : undefined;
}

export const logger: Logger = createLogger(isDevelopment, {
  format: isDevelopment ? "pretty" : "json",
  contextFields: requestContextFields,
});
