/**
 * Shared logger core used by both server and client loggers.
 *
 * Each side creates its own `logger` via `createLogger(...)`, supplying its own
 * environment probe. The logging behaviour (formatting, debug-skipping in
 * production) lives here so it is not duplicated.
 *
 * Two output formats:
 * - `pretty` (default): the original positional `console.*` output. Readable in
 *   a terminal, and the only sane choice in a browser console.
 * - `json`: one JSON object per line, so deployed logs are actually
 *   queryable. The request-lifecycle logs in `server/bun.ts` were already JSON
 *   while all 450+ application `logger.error` lines were positional, which made
 *   them impossible to filter on in Railway. Call sites are unchanged — only
 *   rendering differs.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFormat = 'pretty' | 'json';

export type Logger = {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

export type LoggerOptions = {
  format?: LogFormat;
  /** Extra fields resolved per call (e.g. the ambient requestId). */
  contextFields?: () => Record<string, unknown> | undefined;
};

/** Envelope keys a caller's object must never overwrite. */
const RESERVED_FIELDS = new Set(['timestamp', 'level', 'message']);

/** Cap on a single serialized line; oversized payloads are truncated, not dropped. */
const MAX_LINE_LENGTH = 8_000;

/** Only warn/error carry stacks — debug/info stacks are noise at volume. */
const STACK_LEVELS = new Set<LogLevel>(['warn', 'error']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function serializeError(error: Error, includeStack: boolean) {
  return {
    name: error.name,
    message: error.message,
    ...(includeStack && error.stack
      ? { stack: error.stack.split('\n').slice(0, 12).join('\n') }
      : {}),
  };
}

/** JSON.stringify replacer that tolerates cycles and non-serializable values. */
function safeReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_key, value) => {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'function') return '[Function]';
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  };
}

export function buildLogEntry(
  level: LogLevel,
  message: string,
  args: unknown[],
  contextFields?: Record<string, unknown>,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  const extras: unknown[] = [];
  for (const arg of args) {
    if (arg instanceof Error) {
      entry.error = serializeError(arg, STACK_LEVELS.has(level));
      continue;
    }
    if (isPlainObject(arg)) {
      for (const [key, value] of Object.entries(arg)) {
        // A caller field must never clobber the envelope; park collisions.
        if (RESERVED_FIELDS.has(key)) {
          entry[`field_${key}`] = value;
          continue;
        }
        entry[key] = value;
      }
      continue;
    }
    extras.push(arg);
  }
  if (extras.length > 0) {
    entry.args = extras;
  }

  // Context last so an ambient requestId cannot be shadowed by a caller field.
  if (contextFields) {
    Object.assign(entry, contextFields);
  }
  return entry;
}

function writeJson(level: LogLevel, entry: Record<string, unknown>): void {
  let line: string;
  try {
    line = JSON.stringify(entry, safeReplacer());
    if (line.length > MAX_LINE_LENGTH) {
      line = `${line.slice(0, MAX_LINE_LENGTH)}…","truncated":true}`;
    }
  } catch {
    // Never lose a log line to a serialization failure.
    line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message: String(entry.message ?? ''),
      serializationFailed: true,
    });
  }

  switch (level) {
    case 'debug':
      console.debug(line);
      break;
    case 'info':
      console.info(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
  }
}

function writePretty(level: LogLevel, message: string, args: unknown[]): void {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
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
 * Logs a message with the specified level.
 */
export function log(
  level: LogLevel,
  isDevelopment: boolean,
  message: string,
  ...args: unknown[]
): void {
  if (!isDevelopment && level === 'debug') {
    // Skip debug logs in production
    return;
  }
  writePretty(level, message, args);
}

/**
 * Build a logger bound to a development flag.
 */
export function createLogger(
  isDevelopment: boolean,
  options: LoggerOptions = {},
): Logger {
  const format = options.format ?? 'pretty';

  const emit = (level: LogLevel, message: string, args: unknown[]): void => {
    if (!isDevelopment && level === 'debug') {
      return;
    }
    if (format === 'json') {
      writeJson(level, buildLogEntry(level, message, args, options.contextFields?.()));
      return;
    }
    const context = options.contextFields?.();
    writePretty(level, message, context ? [...args, context] : args);
  };

  return {
    debug: (message, ...args) => emit('debug', message, args),
    info: (message, ...args) => emit('info', message, args),
    warn: (message, ...args) => emit('warn', message, args),
    error: (message, ...args) => emit('error', message, args),
  };
}
