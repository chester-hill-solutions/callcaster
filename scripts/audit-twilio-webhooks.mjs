#!/usr/bin/env node
/**
 * Read-only Twilio webhook audit for a workspace (local/dev).
 * Usage: node scripts/audit-twilio-webhooks.mjs <workspace_id>
 * Requires SUPABASE_URL, SUPABASE_SERVICE_KEY, TWILIO credentials on workspace row, BASE_URL.
 */
import { createClient } from "@supabase/supabase-js";

const workspaceId = process.argv[2];
if (!workspaceId) {
  console.error("Usage: node scripts/audit-twilio-webhooks.mjs <workspace_id>");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const { auditWorkspaceTwilioWebhooks } = await import(
  "../app/lib/twilio-webhook-audit.server.ts"
);

const audit = await auditWorkspaceTwilioWebhooks({
  supabaseClient: supabase,
  workspaceId,
});

console.log(JSON.stringify(audit, null, 2));
