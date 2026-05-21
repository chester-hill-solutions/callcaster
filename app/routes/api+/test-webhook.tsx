import { ActionFunction, json } from "@remix-run/node";
import { safeParseJson } from "@/lib/database.server";
import { testWebhook } from "@/lib/workspace-settings/WorkspaceSettingUtils";
import { logger } from "@/lib/logger.server";

export const action: ActionFunction = async ({ request }) => {
  const {event, destination_url, custom_headers} = await safeParseJson<{ event: string; destination_url: string; custom_headers: string }>(request)
    const eventData = JSON.parse(event)
    const customHeaders = JSON.parse(custom_headers)
    if (typeof eventData !== "object" || typeof destination_url !== "string") {
    logger.warn('Invalid input for webhook test');
    return json({ error: "Invalid input" }, { status: 400 });
  }
  const cleanHeaders: Record<string, string> = {};
  customHeaders.map((header: [string, string]) => (cleanHeaders[header[0]] = header[1]));

  const result = await testWebhook(eventData, destination_url, cleanHeaders);

  return json(result);
};