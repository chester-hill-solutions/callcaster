import { Form, useFetcher } from "react-router";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Heading } from "@/components/ui/typography";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { WebhookEventPicker } from "@/components/workspace/WebhookEventPicker";
import {
  selectedSetToWebhookEvents,
  webhookEventsToSelectedSet,
  type WebhookEventOption,
} from "@/lib/webhook-event-options.shared";
import type {
  WebhookEvent,
  WebhookEventCategory,
  WebhookEventType,
} from "@/lib/twilio.types";

type TestWebhookResult = {
  data?: unknown;
  status?: number;
  statusText?: string;
  error?: string | null;
};

type SaveWebhookResult = {
  data?: unknown;
  error?: string | null;
};

type WebhookEditorProps = {
  initialWebhook?: {
    id: string;
    destination_url: string;
    events: WebhookEvent[];
    custom_headers?: Record<string, string>;
  };
  userId: string;
  workspaceId: string;
};

const testEvents = {
  inbound_call: {
    event_category: "inbound_call",
    event_type: "INSERT",
    workspace_id: "workspace-id",
    timestamp: new Date().toISOString(),
    payload: {
      call_sid: "CA12345",
      from: "+15551234567",
      to: "+15557654321",
      status: "completed",
      direction: "inbound",
      timestamp: new Date().toISOString(),
    },
  },
  inbound_sms: {
    event_category: "inbound_sms",
    event_type: "INSERT",
    workspace_id: "workspace-id",
    timestamp: new Date().toISOString(),
    payload: {
      message_sid: "SM12345",
      from: "+15551234567",
      to: "+15557654321",
      body: "Test inbound message",
      num_media: 0,
      media_urls: null,
      timestamp: new Date().toISOString(),
    },
  },
  outbound_call: {
    event_category: "outbound_call",
    event_type: "INSERT",
    workspace_id: "workspace-id",
    timestamp: new Date().toISOString(),
    payload: {
      call_sid: "CA67890",
      from: "+15557654321",
      to: "+15551234567",
      status: "completed",
      direction: "outbound",
      timestamp: new Date().toISOString(),
    },
  },
  outbound_sms: {
    event_category: "outbound_sms",
    event_type: "INSERT",
    workspace_id: "workspace-id",
    timestamp: new Date().toISOString(),
    payload: {
      message_sid: "SM67890",
      from: "+15557654321",
      to: "+15551234567",
      body: "Test outbound message",
      status: "sent",
      timestamp: new Date().toISOString(),
    },
  },
  voicemail: {
    event_category: "voicemail",
    event_type: "INSERT",
    workspace_id: "workspace-id",
    timestamp: new Date().toISOString(),
    payload: {
      call_sid: "RE12345",
      from: "+15551234567",
      to: "+15557654321",
      recording_url: "https://example.com/recording.mp3",
      duration: "30",
      timestamp: new Date().toISOString(),
    },
  },
} as const;

export default function WebhookEditor({
  initialWebhook,
  userId,
  workspaceId,
}: WebhookEditorProps) {
  const [destinationUrl, setDestinationUrl] = useState(
    initialWebhook?.destination_url || "",
  );
  const [selectedEvents, setSelectedEvents] = useState<ReadonlySet<string>>(
    () => webhookEventsToSelectedSet(initialWebhook?.events ?? []),
  );
  const [customHeaders, setCustomHeaders] = useState<Array<[string, string]>>(
    Object.entries(initialWebhook?.custom_headers || {}),
  );
  const [eventsError, setEventsError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const testFetcher = useFetcher<TestWebhookResult>({ key: "webhook-test" });
  const saveFetcher = useFetcher<SaveWebhookResult>({ key: "webhook-save" });
  const isBusy = testFetcher.state !== "idle";
  const isSaving = saveFetcher.state !== "idle";

  useActionFeedback(testFetcher.data, {
    getError: (data) => data?.error ?? undefined,
    getWarning: (data) =>
      data && typeof data.status === "number" && data.status >= 400
        ? `Destination responded with status ${data.status}`
        : undefined,
    getSuccess: (data) =>
      Boolean(
        data &&
          data.error == null &&
          (typeof data.status !== "number" || data.status < 400),
      ),
    successMessage: (data) =>
      typeof data?.status === "number"
        ? `Test event delivered (status ${data.status})`
        : "Test event delivered",
  });

  useActionFeedback(saveFetcher.data, {
    getError: (data) => data?.error ?? undefined,
    getSuccess: (data) => Boolean(data && data.error == null),
    successMessage: "Webhook saved",
  });

  const submitTestEvent = (
    category: WebhookEventCategory,
    eventType: WebhookEventType,
  ) => {
    if (isBusy || !destinationUrl) return;

    const testEvent = JSON.parse(JSON.stringify(testEvents[category])) as {
      event_type: string;
      workspace_id: string;
      timestamp: string;
      payload: Record<string, unknown>;
    };

    testEvent.event_type = eventType;
    testEvent.workspace_id = workspaceId;
    testEvent.timestamp = new Date().toISOString();

    if (eventType === "UPDATE") {
      switch (category) {
        case "inbound_call":
        case "outbound_call":
          testEvent.payload.status = "completed";
          testEvent.payload.duration = "120";
          testEvent.payload.updated_at = new Date().toISOString();
          break;
        case "inbound_sms":
        case "outbound_sms":
          testEvent.payload.status = "delivered";
          testEvent.payload.updated_at = new Date().toISOString();
          break;
        case "voicemail":
          testEvent.payload.transcription =
            "This is a test transcription of the voicemail.";
          testEvent.payload.updated_at = new Date().toISOString();
          break;
        default: {
          const _exhaustive: never = category;
          return _exhaustive;
        }
      }
    }

    testFetcher.submit(
      {
        event: JSON.stringify(testEvent),
        destination_url: destinationUrl,
        custom_headers: JSON.stringify(customHeaders),
      },
      {
        method: "POST",
        action: "/api/test-webhook",
        encType: "application/json",
      },
    );
  };

  const handleTestOption = (option: WebhookEventOption) => {
    submitTestEvent(option.eventCategory, option.eventType);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const events = selectedSetToWebhookEvents(selectedEvents);
    if (events.length === 0) {
      setEventsError("Select at least one event kind.");
      return;
    }
    setEventsError(null);

    const formData = new FormData();
    if (initialWebhook) {
      formData.append("webhookId", initialWebhook.id);
    }
    formData.append("formName", "updateWebhook");
    formData.append("userId", userId);
    formData.append("destinationUrl", destinationUrl);
    formData.append("events", JSON.stringify(events));
    formData.append("customHeaders", JSON.stringify(customHeaders));

    saveFetcher.submit(formData, {
      method: "post",
    });
  };

  const handleHeaderChange = (index: number, key: string, value: string) => {
    setCustomHeaders((prev) => {
      const newHeaders = [...prev];
      newHeaders[index] = [key, value];
      return newHeaders;
    });
  };

  const addNewHeader = () => {
    setCustomHeaders((prev) => [...prev, ["", ""]]);
  };

  const removeHeader = (index: number) => {
    setCustomHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Form
      method="POST"
      className="flex w-full flex-col gap-4"
      ref={formRef}
      onSubmit={handleSubmit}
    >
      <FormField
        htmlFor="destinationUrl"
        label="Destination URL"
        description="Callcaster will send matching events to this endpoint."
      >
        <Input
          type="url"
          name="destinationUrl"
          id="destinationUrl"
          value={destinationUrl}
          onChange={(e) => setDestinationUrl(e.target.value)}
          className="bg-transparent"
        />
      </FormField>

      <div className="space-y-2">
        <WebhookEventPicker
          selected={selectedEvents}
          onSelectedChange={(next) => {
            setSelectedEvents(next);
            if (next.size > 0) setEventsError(null);
          }}
          onTestEvent={handleTestOption}
          testBusy={isBusy}
          canTest={Boolean(destinationUrl)}
        />
        {eventsError ? (
          <p className="text-sm text-destructive" role="alert">
            {eventsError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Heading as="h3" level={4} branded={false}>
          Custom Headers
        </Heading>
        {customHeaders.map(([key, value], index) => {
          return (
            <div key={index} className="flex gap-2">
              <Input
                type="text"
                value={key}
                onChange={(e) =>
                  handleHeaderChange(index, e.target.value, value)
                }
                placeholder="Header Key"
                className="flex-1 bg-transparent"
              />
              <Input
                type="text"
                value={value}
                onChange={(e) =>
                  handleHeaderChange(index, key, e.target.value)
                }
                placeholder="Header Value"
                className="flex-1 bg-transparent"
              />
              <Button
                type="button"
                onClick={() => removeHeader(index)}
                variant="destructive"
              >
                Remove
              </Button>
            </div>
          );
        })}
        <Button type="button" onClick={addNewHeader} variant="outline">
          Add Header
        </Button>
      </div>

      <Button type="submit" disabled={isSaving}>
        {isSaving ? "Saving..." : "Update Webhook"}
      </Button>
    </Form>
  );
}
