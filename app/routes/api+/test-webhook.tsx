import { data as routeData, ActionFunction } from "react-router";



export const action: ActionFunction = async ({ request }) => {
  const { safeParseJson } = await import("@/lib/database.server");
  const { logger } = await import("@/lib/logger.server");
  const { testWebhook } = await import("@/lib/workspace-settings/WorkspaceSettingUtils.server");
  const {event, destination_url, custom_headers} = await safeParseJson<{ event: string; destination_url: string; custom_headers: string }>(request)
    const eventData = JSON.parse(event)
    const customHeaders = JSON.parse(custom_headers)
    if (typeof eventData !== "object" || typeof destination_url !== "string") {
    logger.warn('Invalid input for webhook test');
    return routeData({ error: "Invalid input" }, { status: 400 });
  }
  const cleanHeaders: Record<string, string> = {};
  customHeaders.map((header: [string, string]) => (cleanHeaders[header[0]] = header[1]));

  const result = await testWebhook(eventData, destination_url, cleanHeaders);

  return routeData(result);
};