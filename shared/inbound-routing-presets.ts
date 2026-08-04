export const INBOUND_ROUTING_PRESET_IDS = [
  "agent",
  "queue",
  "automated_menu",
  "voicemail",
  "forward",
  "webhook_only",
  "custom",
] as const;

export type InboundRoutingPresetId = (typeof INBOUND_ROUTING_PRESET_IDS)[number];

export const INBOUND_ROUTING_RUNTIME_PRECEDENCE = [
  "automated_menu",
  "queue",
  "agent",
  "forward",
  "voicemail",
  "fallback",
] as const;

export type InboundRoutingRuntimeRoute =
  (typeof INBOUND_ROUTING_RUNTIME_PRECEDENCE)[number];

export type InboundRoutingFields = {
  type?: string | null;
  handset_enabled?: boolean | null;
  inbound_action?: string | null;
  inbound_audio?: string | null;
  inbound_queue_id?: number | null;
  inbound_script_id?: number | null;
};

export type InboundRoutingPatch = {
  handset_enabled: boolean;
  inbound_action: string | null;
  inbound_audio: string | null;
  inbound_queue_id: number | null;
  inbound_script_id: number | null;
};

export type InboundRoutingPresetApplication =
  | {
      presetId: "agent";
      fallbackEmail?: string | null;
      audioName?: string | null;
    }
  | { presetId: "queue"; queueId: number }
  | { presetId: "automated_menu"; scriptId: number }
  | {
      presetId: "voicemail";
      notificationEmail: string;
      audioName?: string | null;
    }
  | { presetId: "forward"; phoneNumber: string }
  | { presetId: "webhook_only" };

export type InboundRoutingInference = {
  presetId: InboundRoutingPresetId;
  reasons: string[];
};

export type InboundRoutingName = {
  id: number;
  name: string | null;
};

export type InboundRoutingSummaryNames = {
  queues?: readonly InboundRoutingName[];
  scripts?: readonly InboundRoutingName[];
};

export type EffectiveInboundRoutingSummary = {
  route: InboundRoutingRuntimeRoute | "outbound_only" | "webhook_only";
  label: string;
  detail: string | null;
};

export type InboundRoutingPresetDescriptor = {
  id: InboundRoutingPresetId;
  label: string;
  description: string;
};

export const INBOUND_ROUTING_PRESETS: readonly InboundRoutingPresetDescriptor[] = [
  {
    id: "agent",
    label: "Agent",
    description: "Ring an active workspace handset.",
  },
  {
    id: "queue",
    label: "Queue",
    description: "Send callers to a team queue.",
  },
  {
    id: "automated_menu",
    label: "Automated menu",
    description: "Guide callers through a call script.",
  },
  {
    id: "voicemail",
    label: "Voicemail",
    description: "Record a message and notify an email address.",
  },
  {
    id: "forward",
    label: "Forward call",
    description: "Send calls to another phone number.",
  },
  {
    id: "webhook_only",
    label: "Webhook events",
    description: "Deliver inbound call events to the workspace webhook.",
  },
  {
    id: "custom",
    label: "Custom routing",
    description: "Review routing assembled from existing number settings.",
  },
] as const;

const EMPTY_ROUTING_PATCH: InboundRoutingPatch = {
  handset_enabled: false,
  inbound_action: null,
  inbound_audio: null,
  inbound_queue_id: null,
  inbound_script_id: null,
};

/**
 * Builds a complete routing patch. Every preset clears fields used by other
 * routes so runtime precedence cannot silently select a different destination.
 */
export function buildInboundRoutingPresetPatch(
  application: InboundRoutingPresetApplication,
): InboundRoutingPatch {
  switch (application.presetId) {
    case "agent": {
      const fallbackEmail = normalizeOptionalText(application.fallbackEmail);
      const audioName = normalizeOptionalText(application.audioName);
      if (fallbackEmail && !isConservativeEmail(fallbackEmail)) {
        throw new Error("A valid agent fallback email is required");
      }
      if (audioName && !fallbackEmail) {
        throw new Error("An agent voicemail greeting needs a fallback email");
      }
      return {
        ...EMPTY_ROUTING_PATCH,
        handset_enabled: true,
        inbound_action: fallbackEmail,
        inbound_audio: audioName,
      };
    }
    case "queue":
      assertPositiveId(application.queueId, "Queue");
      return { ...EMPTY_ROUTING_PATCH, inbound_queue_id: application.queueId };
    case "automated_menu":
      assertPositiveId(application.scriptId, "Script");
      return { ...EMPTY_ROUTING_PATCH, inbound_script_id: application.scriptId };
    case "voicemail": {
      const notificationEmail = application.notificationEmail.trim();
      if (!isConservativeEmail(notificationEmail)) {
        throw new Error("A valid voicemail notification email is required");
      }
      return {
        ...EMPTY_ROUTING_PATCH,
        inbound_action: notificationEmail,
        inbound_audio: normalizeOptionalText(application.audioName),
      };
    }
    case "forward": {
      const phoneNumber = application.phoneNumber.trim();
      if (!isConservativePhoneNumber(phoneNumber)) {
        throw new Error("A valid forwarding phone number is required");
      }
      return { ...EMPTY_ROUTING_PATCH, inbound_action: phoneNumber };
    }
    case "webhook_only":
      return { ...EMPTY_ROUTING_PATCH, inbound_action: "webhook_only" };
    default: {
      const exhaustivePreset: never = application;
      return exhaustivePreset;
    }
  }
}

export function inferInboundRoutingPreset(
  fields: InboundRoutingFields,
): InboundRoutingInference {
  if (fields.type === "caller_id") {
    return {
      presetId: "custom",
      reasons: ["Caller ID numbers support outbound calling."],
    };
  }

  const reasons: string[] = [];
  const routes: InboundRoutingPresetId[] = [];
  const action = normalizeOptionalText(fields.inbound_action);
  const audio = normalizeOptionalText(fields.inbound_audio);

  if (isPositiveId(fields.inbound_script_id)) {
    routes.push("automated_menu");
  } else if (fields.inbound_script_id != null) {
    reasons.push("The automated menu reference is invalid.");
  }

  if (isPositiveId(fields.inbound_queue_id)) {
    routes.push("queue");
  } else if (fields.inbound_queue_id != null) {
    reasons.push("The queue reference is invalid.");
  }

  if (fields.handset_enabled === true) {
    routes.push("agent");
  }

  if (action === "webhook_only") {
    routes.push("webhook_only");
  } else if (action && isConservativePhoneNumber(action)) {
    routes.push("forward");
  } else if (action && isConservativeEmail(action)) {
    routes.push("voicemail");
  } else if (action) {
    reasons.push("Use a phone number, email, or webhook value for the inbound action.");
  }

  if (audio && !routes.includes("voicemail")) {
    reasons.push("A voicemail greeting needs a voicemail notification email.");
  }

  const isCanonicalAgentWithVoicemailFallback =
    routes.length === 2 &&
    routes.includes("agent") &&
    routes.includes("voicemail");
  if (reasons.length === 0 && isCanonicalAgentWithVoicemailFallback) {
    return { presetId: "agent", reasons: [] };
  }

  if (routes.length === 0) {
    reasons.push("Choose an inbound routing destination.");
  } else if (routes.length > 1) {
    reasons.push(
      `Multiple routing destinations are configured: ${routes
        .map(presetLabel)
        .join(", ")}.`,
    );
  }

  if (reasons.length > 0 || routes.length !== 1) {
    return { presetId: "custom", reasons };
  }

  const presetId = routes[0];
  if (!presetId) {
    return {
      presetId: "custom",
      reasons: ["Choose an inbound routing destination."],
    };
  }
  return { presetId, reasons: [] };
}

/**
 * Describes the route selected by the existing inbound runtime, including its
 * script → queue → handset → phone → email → fallback precedence.
 */
export function summarizeEffectiveInboundRouting(
  fields: InboundRoutingFields,
  names: InboundRoutingSummaryNames = {},
): EffectiveInboundRoutingSummary {
  if (fields.type === "caller_id") {
    return {
      route: "outbound_only",
      label: "Outbound calling",
      detail: null,
    };
  }

  if (isPositiveId(fields.inbound_script_id)) {
    return {
      route: "automated_menu",
      label: "Automated menu",
      detail: resolveName(names.scripts, fields.inbound_script_id, "Script"),
    };
  }
  if (isPositiveId(fields.inbound_queue_id)) {
    return {
      route: "queue",
      label: "Queue",
      detail: resolveName(names.queues, fields.inbound_queue_id, "Queue"),
    };
  }
  if (fields.handset_enabled === true) {
    const fallbackAction = normalizeOptionalText(fields.inbound_action);
    return {
      route: "agent",
      label: "Agent handset",
      detail:
        fallbackAction && isConservativeEmail(fallbackAction)
          ? `Voicemail fallback: ${fallbackAction}`
          : null,
    };
  }

  const action = normalizeOptionalText(fields.inbound_action);
  if (action && isConservativePhoneNumber(action)) {
    return { route: "forward", label: "Forward call", detail: action };
  }
  if (action && isConservativeEmail(action)) {
    return { route: "voicemail", label: "Voicemail", detail: action };
  }
  if (action === "webhook_only") {
    return {
      route: "webhook_only",
      label: "Webhook events",
      detail: null,
    };
  }
  return {
    route: "fallback",
    label: "Standard unavailable message",
    detail: null,
  };
}

/**
 * Pure shared validators intentionally mirror the runtime's conservative
 * accepted shapes without importing app or server modules.
 */
export function isConservativePhoneNumber(value: string): boolean {
  return /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/.test(
    value,
  );
}

export function isConservativeEmail(value: string): boolean {
  if (value.length > 254) return false;
  const match =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/.exec(
      value,
    );
  if (!match) return false;
  const [localPart, domain] = value.split("@");
  if (!localPart || !domain || localPart.length > 64 || domain.length > 255) {
    return false;
  }
  const topLevelDomain = domain.split(".").at(-1);
  return domain.includes(".") && Boolean(topLevelDomain && topLevelDomain.length >= 2);
}

function assertPositiveId(value: number, label: string): void {
  if (!isPositiveId(value)) {
    throw new Error(`${label} ID must be a positive integer`);
  }
}

function isPositiveId(value: number | null | undefined): value is number {
  return Number.isInteger(value) && Boolean(value && value > 0);
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveName(
  choices: readonly InboundRoutingName[] | undefined,
  id: number,
  fallbackLabel: string,
): string {
  const name = normalizeOptionalText(choices?.find((choice) => choice.id === id)?.name);
  return name ?? `${fallbackLabel} #${id}`;
}

function presetLabel(presetId: InboundRoutingPresetId): string {
  switch (presetId) {
    case "agent":
      return "agent";
    case "queue":
      return "queue";
    case "automated_menu":
      return "automated menu";
    case "voicemail":
      return "voicemail";
    case "forward":
      return "forwarding";
    case "webhook_only":
      return "webhook events";
    case "custom":
      return "custom routing";
    default: {
      const exhaustivePreset: never = presetId;
      return exhaustivePreset;
    }
  }
}
