import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const modules = [
  "../_shared/audience-upload.ts",
  "../_shared/ivr-status-logic.ts",
  "../_shared/queue-sync.ts",
  "../_shared/sms-status-logic.ts",
  "../call-server/index.ts",
  "../cancel_calls/index.ts",
  "../create_schedule_jobs/index.ts",
  "../dequeue_contacts/index.ts",
  "../handle_active_change/index.ts",
  "../invite-user-by-email/index.ts",
  "../ivr-flow/index.ts",
  "../ivr-handler/index.ts",
  "../ivr-recording/index.ts",
  "../ivr-status/index.ts",
  "../outreach-attempt-hook/index.ts",
  "../process-audience-upload/index.ts",
  "../process-ivr/index.ts",
  "../queue-next/index.ts",
  "../sms-handler/index.ts",
  "../sms-status/index.ts",
  "../update_audience_membership/index.ts",
  "../update_queue_by_campaign_audience/index.ts",
] as const;

Deno.test(
  {
    name: "imports all Edge Function modules (smoke)",
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
  // Many function modules create clients at import-time; give them safe defaults.
  Deno.env.set("SUPABASE_URL", "http://localhost");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  Deno.env.set("SUPABASE_SERVICE_KEY", "test-service");
  Deno.env.set("EDGE_FUNCTION_JWT", "a.b.c");
  Deno.env.set("TWILIO_SID", "AC_test");
  Deno.env.set("TWILIO_AUTH_TOKEN", "twilio-token");

  for (const m of modules) {
    await import(m);
  }
  assert(true);
  },
);

