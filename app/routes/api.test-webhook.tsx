import { ActionFunction, json } from "@remix-run/node";
import { testWebhook } from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";

export const action: ActionFunction = async ({ request }) => {
  const {event, destination_url, custom_headers} = await request.json()
    const eventData = JSON.parse(event)
    const customHeaders = JSON.parse(custom_headers)
    if (typeof eventData !== "object" || typeof destination_url !== "string") {
    console.warn('Invalid input')
    return json({ error: "Invalid input" }, { status: 400 });
  }
  const cleanHeaders: Record<string, string> = {};
  customHeaders.map((header: [string, string]) => (cleanHeaders[header[0]] = header[1]));

  const result = await testWebhook(eventData, destination_url, cleanHeaders);

  return json(result);
};