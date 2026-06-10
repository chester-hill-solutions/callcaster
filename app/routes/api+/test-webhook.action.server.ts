import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { safeParseJson } from "@/lib/database.server";
import { testWebhook } from "@/lib/workspace-settings/WorkspaceSettingUtils.server";
import { assertSafeOutboundUrl } from "@/lib/safe-outbound-url.server";
import { verifyAuth } from "@/lib/supabase.server";

import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { user } = await verifyAuth(request);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }

  const { event, destination_url, custom_headers } = await safeParseJson<{
    event: string;
    destination_url: string;
    custom_headers: string;
  }>(request);

  let eventData: unknown;
  let customHeaders: unknown;
  try {
    eventData = JSON.parse(event);
    customHeaders = JSON.parse(custom_headers);
  } catch {
    return routeData({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (typeof eventData !== "object" || eventData === null || typeof destination_url !== "string") {
    logger.warn("Invalid input for webhook test");
    return routeData({ error: "Invalid input" }, { status: 400 });
  }

  try {
    assertSafeOutboundUrl(destination_url);
  } catch (urlError) {
    const message =
      urlError instanceof Error ? urlError.message : "Destination URL is not allowed";
    return routeData({ error: message }, { status: 400 });
  }

  const cleanHeaders: Record<string, string> = {};
  if (Array.isArray(customHeaders)) {
    customHeaders.forEach((header: [string, string]) => {
      if (header?.[0]) {
        cleanHeaders[header[0]] = header[1];
      }
    });
  } else if (customHeaders && typeof customHeaders === "object") {
    Object.assign(cleanHeaders, customHeaders as Record<string, string>);
  }

  const result = await testWebhook(
    eventData as Record<string, unknown>,
    destination_url,
    cleanHeaders,
  );

  return routeData(result);
};
