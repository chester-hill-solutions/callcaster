import { ActionFunction, json } from "@remix-run/node";
import { testWebhook } from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";

export const action: ActionFunction = async ({ request }) => {
  const {event, destination_url, custom_headers} = await request.json()
    console.log('Test Webhook Event', event, destination_url, custom_headers)
  if (typeof event !== "object" || typeof destination_url !== "string") {
    return json({ error: "Invalid input" }, { status: 400 });
  }
  const cleanHeaders = {};
  custom_headers.map((header) => (cleanHeaders[header[0]] = header[1]));

  const result = await testWebhook(event, destination_url, cleanHeaders);
  return json(result);
};