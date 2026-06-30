
import type { Database, Tables } from "@/lib/db-types";
import { logger } from "@/lib/logger.server";
import { getWorkspaceWebhookRow } from "@/lib/workspace-members-db.server";

type WebhookWithEvents = Tables<"webhook"> & {
  events?: Array<{ category: string; type: string }>;
};

export async function sendWorkspaceWebhookNotification({
  eventCategory,
  eventType,
  workspaceId,
  payload,
  optional = false,
}: {
  eventCategory: string;
  eventType: "INSERT" | "UPDATE";
  workspaceId: string;
  payload: Record<string, unknown>;
  null?: never;
  /** When true, missing/disabled webhooks are treated as a no-op success. */
  optional?: boolean;
}): Promise<{ success: boolean; error?: string | null }> {
  try {
    const webhook = await getWorkspaceWebhookRow(workspaceId);

    if (!webhook) {
      if (optional) {
        return { success: true, error: null };
      }
      logger.error(`No webhook configured for workspace ${workspaceId}`);
      return {
        success: false,
        error: "No webhook configured",
      };
    }

    const webhookWithEvents = webhook as WebhookWithEvents;
    const hasMatchingEvent =
      webhookWithEvents.events &&
      Array.isArray(webhookWithEvents.events) &&
      webhookWithEvents.events.some(
        (event) => event.category === eventCategory && event.type === eventType,
      );

    if (!hasMatchingEvent) {
      if (optional) {
        return { success: true, error: null };
      }
      logger.warn(`Webhook not configured for ${eventCategory}/${eventType} events`);
      return {
        success: false,
        error: "Event type not enabled for this webhook",
      };
    }

    const customHeaders =
      webhook.custom_headers && typeof webhook.custom_headers === "object"
        ? (webhook.custom_headers as Record<string, string>)
        : {};

    const result = await fetch(webhook.destination_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...customHeaders,
      },
      body: JSON.stringify({
        event_category: eventCategory,
        event_type: eventType,
        workspace_id: workspaceId,
        timestamp: new Date().toISOString(),
        payload,
      }),
    });

    if (!result.ok) {
      logger.error(
        `Webhook delivery failed: ${result.status} ${result.statusText}`,
      );
      return {
        success: false,
        error: `Webhook delivery failed: ${result.status} ${result.statusText}`,
      };
    }

    return { success: true, error: null };
  } catch (error: unknown) {
    logger.error("Error sending webhook notification", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
