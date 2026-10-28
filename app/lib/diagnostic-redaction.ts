const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /password|secret|token|authorization|credential|twilio_data|^(?:params|parameters|key)$/i;

export function redactDiagnosticText(text: string): string {
  // Parameter values can contain newlines and text that looks like stack frames.
  return text.replace(/\bparams:[\s\S]*/i, `params: ${REDACTED}`);
}

export function redactDiagnosticValue(value: Error): Error;
export function redactDiagnosticValue(value: Record<string, unknown>): Record<string, unknown>;
export function redactDiagnosticValue(value: unknown): unknown;
export function redactDiagnosticValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  let remaining = 2_000;

  function visit(input: unknown, depth: number): unknown {
    if (depth > 12 || --remaining < 0) return "[Truncated]";
    if (typeof input === "string") return redactDiagnosticText(input);
    if (typeof input === "function") return "[Function]";
    if (input === null || typeof input !== "object") return input;
    if (seen.has(input)) return "[Circular]";
    seen.add(input);

    if (input instanceof Error) {
      const message = redactDiagnosticText(input.message);
      const error = new Error(message);
      error.name = redactDiagnosticText(input.name);
      if (input.stack) {
        // Remove the complete original message before retaining real frames.
        const start = input.stack.indexOf(input.message);
        error.stack = start < 0
          ? redactDiagnosticText(input.stack)
          : redactDiagnosticText(input.stack.slice(0, start)) + message
            + redactDiagnosticText(input.stack.slice(start + input.message.length));
      }
      if (input.cause !== undefined) error.cause = visit(input.cause, depth + 1);
      if ("code" in input && (typeof input.code === "string" || typeof input.code === "number")) {
        Object.assign(error, { code: visit(input.code, depth + 1) });
      }
      return error;
    }
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(child => visit(child, depth + 1));
    return Object.fromEntries(Object.entries(input).map(([key, child]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : visit(child, depth + 1),
    ]));
  }

  return visit(value, 0);
}
