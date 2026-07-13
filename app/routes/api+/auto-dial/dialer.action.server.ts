import {
  completeAllConferences,
  createOutreachAttempt,
  createTwilioCall,
  getNextAutoDialQueueContact,
  normalizePhoneNumber,
  runAutoDialerTurn,
  saveCallToDatabase,
} from "@/lib/auto-dial.server";
import { safeParseJson } from "@/lib/request-utils.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

export {
  completeAllConferences,
  createOutreachAttempt,
  createTwilioCall,
  getNextAutoDialQueueContact,
  getNextAutoDialQueueContact as getNextContact,
  normalizePhoneNumber,
  runAutoDialerTurn,
  saveCallToDatabase,
} from "@/lib/auto-dial.server";

export const action = defineAction({
  sideEffects: ["twilio", "db-write"],
  handler: async ({ request }: ActionFunctionArgs) => {
    const body = await safeParseJson<{
      user_id: string;
      campaign_id: number;
      workspace_id: string;
      selected_device: string;
      conference_id?: string;
    }>(request);

    const result = await runAutoDialerTurn(body);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
