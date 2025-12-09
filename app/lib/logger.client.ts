/**
 * Client-side logging utility
 * 
 * Provides structured logging for browser/client-side code.
 * Debug logs are automatically disabled in production builds.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDevelopment = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1' ||
   process.env.NODE_ENV === 'development');

/**
 * Logs a message with the specified level
 */
function log(level: LogLevel, message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (!isDevelopment && level === 'debug') {
    // Skip debug logs in production
    return;
  }

  switch (level) {
    case 'debug':
      console.debug(prefix, message, ...args);
      break;
    case 'info':
      console.info(prefix, message, ...args);
      break;
    case 'warn':
      console.warn(prefix, message, ...args);
      break;
    case 'error':
      console.error(prefix, message, ...args);
      break;
  }
}

/**
 * Client-side logger
 * 
 * Usage:
 *   import { logger } from '~/lib/logger.client';
 *   logger.debug('Debug message');
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message', error);
 */
export const logger = {
  debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
  info: (message: string, ...args: unknown[]) => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => log('error', message, ...args),
} as const;
