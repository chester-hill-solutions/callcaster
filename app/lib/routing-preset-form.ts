import type {
  InboundRoutingPresetApplication,
  InboundRoutingPresetId,
} from "../../shared/inbound-routing-presets";
import { INBOUND_ROUTING_PRESET_IDS } from "../../shared/inbound-routing-presets";

function parsePositiveId(value: unknown, choice: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Choose ${choice}`);
  }
  return id;
}

// Accepts `Record<string, unknown>` because callers now feed it
// `parseActionRequest` output (JSON bodies as well as form posts). Every read
// below coerces with String()/Number(), so a wider input type is safe.
export function parseRoutingPresetApplication(
  data: Record<string, unknown>,
): InboundRoutingPresetApplication {
  const presetId = String(data.presetId ?? "") as InboundRoutingPresetId;
  if (!INBOUND_ROUTING_PRESET_IDS.includes(presetId) || presetId === "custom") {
    throw new Error("Choose a routing preset");
  }

  switch (presetId) {
    case "agent":
      return {
        presetId,
        fallbackEmail: String(data.fallbackEmail ?? ""),
        audioName: String(data.audioName ?? ""),
      };
    case "queue":
      return {
        presetId,
        queueId: parsePositiveId(data.queueId, "a queue"),
      };
    case "automated_menu":
      return {
        presetId,
        scriptId: parsePositiveId(data.scriptId, "an automated menu"),
      };
    case "voicemail":
      return {
        presetId,
        notificationEmail: String(data.notificationEmail ?? ""),
        audioName: String(data.audioName ?? ""),
      };
    case "forward":
      return { presetId, phoneNumber: String(data.phoneNumber ?? "") };
    case "webhook_only":
      return { presetId };
    default: {
      const exhaustivePreset: never = presetId;
      return exhaustivePreset;
    }
  }
}
