/**
 * Shared logger core used by both server and client loggers.
 *
 * Each side creates its own `logger` via `createLogger(isDevelopment)`,
 * supplying its own environment probe. The logging behaviour (prefix format,
 * debug-skipping in production) lives here so it is not duplicated.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

/**
 * Logs a message with the specified level
 */
export function log(level: LogLevel, isDevelopment: boolean, message: string, ...args: unknown[]): void {
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
 * Build a logger bound to a development flag.
 */
export function createLogger(isDevelopment: boolean): Logger {
  return {
    debug: (message, ...args) => log('debug', isDevelopment, message, ...args),
    info: (message, ...args) => log('info', isDevelopment, message, ...args),
    warn: (message, ...args) => log('warn', isDevelopment, message, ...args),
    error: (message, ...args) => log('error', isDevelopment, message, ...args),
  };
}
