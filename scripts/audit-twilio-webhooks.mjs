#!/usr/bin/env node
/**
 * Read-only Twilio webhook audit for a workspace (local/dev).
 * Usage: node scripts/audit-twilio-webhooks.mjs <workspace_id>
 * Requires workspace row with TWILIO credentials, BASE_URL.
 */

const workspaceId = process.argv[2];
if (!workspaceId) {
  console.error("Usage: node scripts/audit-twilio-webhooks.mjs <workspace_id>");
  process.exit(1);
}

const { auditWorkspaceTwilioWebhooks } = await import(
  "../app/lib/twilio-webhook-audit.server.ts"
);

const audit = await auditWorkspaceTwilioWebhooks({
  workspaceId,
});

console.log(JSON.stringify(audit, null, 2));
