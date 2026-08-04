import {
  catalogSelectionCoverage,
  filterCatalogItems,
  groupCatalogByCategory,
  visibleCatalogCategories,
  type CatalogPickerItem,
  type CatalogPickerTab,
} from "@/lib/catalog-picker.shared";
import type {
  WebhookEvent,
  WebhookEventCategory,
  WebhookEventType,
} from "@/lib/twilio.types";

export type WebhookEventOptionValue =
  `${WebhookEventCategory}:${Exclude<WebhookEventType, "DELETE">}`;

export type WebhookEventOption = CatalogPickerItem & {
  value: WebhookEventOptionValue;
  eventCategory: WebhookEventCategory;
  eventType: Exclude<WebhookEventType, "DELETE">;
};

export const WEBHOOK_EVENT_OPTIONS: readonly WebhookEventOption[] = [
  {
    value: "inbound_call:INSERT",
    label: "New call",
    description: "Occurs when an inbound call is received.",
    category: "Inbound call",
    eventCategory: "inbound_call",
    eventType: "INSERT",
  },
  {
    value: "inbound_call:UPDATE",
    label: "Call updated",
    description: "Occurs when an inbound call status changes.",
    category: "Inbound call",
    eventCategory: "inbound_call",
    eventType: "UPDATE",
  },
  {
    value: "inbound_sms:INSERT",
    label: "New message",
    description: "Occurs when an inbound SMS is received.",
    category: "Inbound SMS",
    eventCategory: "inbound_sms",
    eventType: "INSERT",
  },
  {
    value: "inbound_sms:UPDATE",
    label: "Message updated",
    description: "Occurs when an inbound SMS status changes.",
    category: "Inbound SMS",
    eventCategory: "inbound_sms",
    eventType: "UPDATE",
  },
  {
    value: "outbound_call:INSERT",
    label: "New call",
    description: "Occurs when an outbound call starts.",
    category: "Outbound call",
    eventCategory: "outbound_call",
    eventType: "INSERT",
  },
  {
    value: "outbound_call:UPDATE",
    label: "Call updated",
    description: "Occurs when an outbound call status changes.",
    category: "Outbound call",
    eventCategory: "outbound_call",
    eventType: "UPDATE",
  },
  {
    value: "outbound_sms:INSERT",
    label: "New message",
    description: "Occurs when an outbound SMS is sent.",
    category: "Outbound SMS",
    eventCategory: "outbound_sms",
    eventType: "INSERT",
  },
  {
    value: "outbound_sms:UPDATE",
    label: "Message updated",
    description: "Occurs when an outbound SMS status changes.",
    category: "Outbound SMS",
    eventCategory: "outbound_sms",
    eventType: "UPDATE",
  },
  {
    value: "voicemail:INSERT",
    label: "New voicemail",
    description: "Occurs when a voicemail recording is created.",
    category: "Voicemail",
    eventCategory: "voicemail",
    eventType: "INSERT",
  },
];

export type WebhookEventOptionCategory = {
  category: string;
  options: WebhookEventOption[];
};

export function encodeWebhookEventOption(
  category: WebhookEventCategory,
  type: Exclude<WebhookEventType, "DELETE">,
): WebhookEventOptionValue {
  return `${category}:${type}`;
}

export function isWebhookEventOptionValue(
  value: string,
): value is WebhookEventOptionValue {
  return WEBHOOK_EVENT_OPTIONS.some((option) => option.value === value);
}

export function webhookEventsToSelectedSet(
  events: readonly WebhookEvent[],
): Set<WebhookEventOptionValue> {
  const selected = new Set<WebhookEventOptionValue>();
  for (const event of events) {
    if (event.type === "DELETE") continue;
    const value = encodeWebhookEventOption(event.category, event.type);
    if (isWebhookEventOptionValue(value)) {
      selected.add(value);
    }
  }
  return selected;
}

export function selectedSetToWebhookEvents(
  selected: ReadonlySet<string>,
): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  for (const option of WEBHOOK_EVENT_OPTIONS) {
    if (selected.has(option.value)) {
      events.push({
        category: option.eventCategory,
        type: option.eventType,
      });
    }
  }
  return events;
}

export type WebhookEventConfig = Record<
  WebhookEventCategory,
  { insert: boolean; update: boolean }
>;

export function selectedSetToEventConfig(
  selected: ReadonlySet<string>,
): WebhookEventConfig {
  return {
    inbound_call: {
      insert: selected.has("inbound_call:INSERT"),
      update: selected.has("inbound_call:UPDATE"),
    },
    inbound_sms: {
      insert: selected.has("inbound_sms:INSERT"),
      update: selected.has("inbound_sms:UPDATE"),
    },
    outbound_call: {
      insert: selected.has("outbound_call:INSERT"),
      update: selected.has("outbound_call:UPDATE"),
    },
    outbound_sms: {
      insert: selected.has("outbound_sms:INSERT"),
      update: selected.has("outbound_sms:UPDATE"),
    },
    voicemail: {
      insert: selected.has("voicemail:INSERT"),
      update: selected.has("voicemail:UPDATE"),
    },
  };
}

export function eventConfigToSelectedSet(
  config: WebhookEventConfig,
): Set<WebhookEventOptionValue> {
  const selected = new Set<WebhookEventOptionValue>();
  for (const option of WEBHOOK_EVENT_OPTIONS) {
    const enabled =
      option.eventType === "INSERT"
        ? config[option.eventCategory].insert
        : config[option.eventCategory].update;
    if (enabled) selected.add(option.value);
  }
  return selected;
}

export function filterWebhookEventOptions(
  options: readonly WebhookEventOption[],
  query: string,
): WebhookEventOption[] {
  return filterCatalogItems(options, query);
}

export function groupWebhookEventOptions(
  options: readonly WebhookEventOption[],
): WebhookEventOptionCategory[] {
  return groupCatalogByCategory(options).map(({ category, items }) => ({
    category,
    options: items,
  }));
}

export function visibleWebhookEventCategories(opts: {
  options: readonly WebhookEventOption[];
  query: string;
  tab: CatalogPickerTab;
  selected: ReadonlySet<string>;
}): WebhookEventOptionCategory[] {
  return visibleCatalogCategories({
    items: opts.options,
    query: opts.query,
    tab: opts.tab,
    selected: opts.selected,
  }).map(({ category, items }) => ({ category, options: items }));
}

export function webhookEventSelectionCoverage(
  options: readonly WebhookEventOption[],
  selected: ReadonlySet<string>,
) {
  return catalogSelectionCoverage(options, selected);
}
