/**
 * Server-side logging utility
 *
 * Delegates the shared logging behaviour to `logger-core` and supplies the
 * server-side development probe.
 *
 * Usage:
 *   import { logger } from '@/lib/logger.server';
 *   logger.debug('Debug message');
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message', error);
 */

import { createLogger, type LogLevel, type Logger } from "./logger-core";

const isDevelopment = process.env.NODE_ENV === "development";
const baseLogger = createLogger(isDevelopment);

type RequestIdGlobal = typeof globalThis & {
  __callcasterRequestIdProvider?: () => string | undefined;
};

function contextualLog(
  level: LogLevel,
  message: string,
  args: unknown[],
): void {
  const requestId = (globalThis as RequestIdGlobal)
    .__callcasterRequestIdProvider?.();
  if (requestId) {
    baseLogger[level](message, ...args, { requestId });
    return;
  }
  baseLogger[level](message, ...args);
}

export const logger: Logger = {
  debug: (message, ...args) => contextualLog("debug", message, args),
  info: (message, ...args) => contextualLog("info", message, args),
  warn: (message, ...args) => contextualLog("warn", message, args),
  error: (message, ...args) => contextualLog("error", message, args),
};
