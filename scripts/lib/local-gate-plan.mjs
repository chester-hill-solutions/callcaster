// Keep generated-file writes and the shared ESLint cache ahead of parallel checks.
export const PREPARE_STEPS = [
  "check:ci-local-order",
  "check:vendor-dist",
  "check:bun-lock",
  "typecheck",
  "lint",
  "check:lint-ratchet",
];

export const CHECK_STEPS = [
  "tools:routes:verify",
  "tools:api:surface:check",
  "check:route-server-leaks",
  "check:route-authz",
  "check:route-membership",
  "check:workspace-projection",
  "check:unscoped-db-imports",
  "check:twilio-webhooks",
  "check:request-body-consumption",
  "check:middleware",
  "check:credit-writes",
  "check:dual-auth",
  "check:auth-rate-limits",
  "check:effects",
  "check:type-safety",
  "check:pg-errors",
  "check:dry",
  "check:handlers",
  "check:test-mocks",
  "check:db-rpcs",
  "check:queue-rpc-contract",
  "check:relative-redirects",
  "check:redirect-targets",
  "check:sheet-bodies",
  "check:no-pii-exports",
  "db:ledger:check",
  "db:bootstrap:check",
  "db:enums:check",
  "db:orphans:check",
  "tools:check-file-size",
  "check:test-echo",
];

export const SLOW_STEPS = [
  "test:vitest",
  "test:node:runtime",
  "build",
  "check:client-bundle",
  "ci:codegen:verify",
];

export function gatePhases(fast = false) {
  const phases = [
    { steps: PREPARE_STEPS, parallel: false },
    { steps: CHECK_STEPS, parallel: true },
  ];
  if (!fast) phases.push({ steps: SLOW_STEPS, parallel: false });
  return phases;
}
