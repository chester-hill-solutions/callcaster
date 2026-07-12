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

export const action = async ({ request }: { request: Request }) => {
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
};
