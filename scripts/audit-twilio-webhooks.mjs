#!/usr/bin/env node
/**
 * Read-only Twilio webhook audit for a workspace (local/dev).
 * Usage: node scripts/audit-twilio-webhooks.mjs <workspace_id>
 * Requires BETTER_AUTH_URL, BETTER_AUTH_SERVICE_KEY, TWILIO credentials on workspace row, BASE_URL.
 */

const workspaceId = process.argv[2];
if (!workspaceId) {
  console.error("Usage: node scripts/audit-twilio-webhooks.mjs <workspace_id>");
  process.exit(1);
}

const client = createClient(
  process.env.BASE_URL,
  process.env.BETTER_AUTH_SECRET,
);

const { auditWorkspaceTwilioWebhooks } = await import(
  "../app/lib/twilio-webhook-audit.server.ts"
);

const audit = await auditWorkspaceTwilioWebhooks({
  null: client,
  workspaceId,
});

console.log(JSON.stringify(audit, null, 2));
