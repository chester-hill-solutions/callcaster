import * as Sentry from "@sentry/bun";
import { redactDiagnosticValue } from "@/lib/diagnostic-redaction";

let initialized = false;

export function initializeSentry(
  service: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const dsn = env.SENTRY_DSN;
  if (!dsn || initialized) {
    return initialized;
  }

  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    release: env.RAILWAY_GIT_COMMIT_SHA,
    serverName: service,
    enabled: true,
    beforeSend(event) {
      return redactDiagnosticValue(event) as typeof event;
    },
  });
  Sentry.setTag("service", service);
  initialized = true;
  return true;
}

export function captureException(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  if (!initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(redactDiagnosticValue(context))) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(redactDiagnosticValue(error));
  });
}
