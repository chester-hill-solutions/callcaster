import { Form, useFetcher } from "@remix-run/react";
import { useRef, useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type EventCategory = 
  | "inbound_call" 
  | "inbound_sms" 
  | "outbound_call"
  | "outbound_sms"
  | "voicemail";

type EventType = "INSERT" | "UPDATE";

type WebhookEvent = {
  category: EventCategory;
  type: EventType;
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

// Test event data
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
    }
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
    }
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
    }
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
    }
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
    }
  }
};

export default function WebhookEditor({
  initialWebhook,
  userId,
  workspaceId,
}: WebhookEditorProps) {
  const [destinationUrl, setDestinationUrl] = useState(
    initialWebhook?.destination_url || "",
  );
  
  const [eventConfig, setEventConfig] = useState<Record<EventCategory, {insert: boolean, update: boolean}>>({
    inbound_call: {
      insert: initialWebhook?.events?.some(e => e.category === "inbound_call" && e.type === "INSERT") || false,
      update: initialWebhook?.events?.some(e => e.category === "inbound_call" && e.type === "UPDATE") || false,
    },
    inbound_sms: {
      insert: initialWebhook?.events?.some(e => e.category === "inbound_sms" && e.type === "INSERT") || false,
      update: initialWebhook?.events?.some(e => e.category === "inbound_sms" && e.type === "UPDATE") || false,
    },
    outbound_call: {
      insert: initialWebhook?.events?.some(e => e.category === "outbound_call" && e.type === "INSERT") || false,
      update: initialWebhook?.events?.some(e => e.category === "outbound_call" && e.type === "UPDATE") || false,
    },
    outbound_sms: {
      insert: initialWebhook?.events?.some(e => e.category === "outbound_sms" && e.type === "INSERT") || false,
      update: initialWebhook?.events?.some(e => e.category === "outbound_sms" && e.type === "UPDATE") || false,
    },
    voicemail: {
      insert: initialWebhook?.events?.some(e => e.category === "voicemail" && e.type === "INSERT") || false,
      update: initialWebhook?.events?.some(e => e.category === "voicemail" && e.type === "UPDATE") || false,
    }
  });
  
  const [customHeaders, setCustomHeaders] = useState<Array<[string, string]>>(
    Object.entries(initialWebhook?.custom_headers || {}),
  );
  const formRef = useRef<HTMLFormElement | null>(null);
  const fetcher = useFetcher();
  const isBusy = fetcher.state !== "idle";

  const submitTestEvent = (category: EventCategory, eventType: EventType) => {
    if (isBusy || !destinationUrl) return;
    
    // Create a deep copy of the test event
    const testEvent = JSON.parse(JSON.stringify(testEvents[category]));
    
    // Update the event type and workspace ID
    testEvent.event_type = eventType;
    testEvent.workspace_id = workspaceId;
    testEvent.timestamp = new Date().toISOString();
    
    // For update events, modify the payload to indicate it's an update
    if (eventType === "UPDATE") {
      // Add appropriate fields based on the category
      switch(category) {
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
          testEvent.payload.transcription = "This is a test transcription of the voicemail.";
          testEvent.payload.updated_at = new Date().toISOString();
          break;
      }
    }
    
    fetcher.submit(
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

  const handleEventConfigChange = (category: EventCategory, type: "insert" | "update", checked: boolean) => {
    setEventConfig(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [type]: checked
      }
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData()
    if (initialWebhook) {
      formData.append("webhookId", initialWebhook.id)
    }
    formData.append("formName", "updateWebhook")
    formData.append("userId", userId)
    formData.append("destinationUrl", destinationUrl)
    
    // Convert event config to array of events
    const events: WebhookEvent[] = [];
    Object.entries(eventConfig).forEach(([category, config]) => {
      if (config.insert) {
        events.push({ category: category as EventCategory, type: "INSERT" });
      }
      if (config.update) {
        events.push({ category: category as EventCategory, type: "UPDATE" });
      }
    });
    
    formData.append("events", JSON.stringify(events))
    formData.append("customHeaders", JSON.stringify(customHeaders))
    
    fetcher.submit(formData, {
      method: "post",
    })
  }

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
    <Form method="POST" className="flex w-full flex-col gap-4" ref={formRef} onSubmit={handleSubmit}>
      <label
        htmlFor="destinationUrl"
        className="flex w-full flex-col text-xl font-semibold dark:text-white"
      >
        Destination URL
        <input
          type="url"
          name="destinationUrl"
          id="destinationUrl"
          value={destinationUrl}
          onChange={(e) => setDestinationUrl(e.target.value)}
          className="rounded-md border border-black bg-transparent px-4 py-2 dark:border-white"
        />
      </label>
      
      <div className="flex flex-col gap-4 border p-4 rounded-md">
        <h3 className="text-xl font-semibold dark:text-white">Event Types</h3>
        
        {/* Inbound Call Events */}
        <div className="flex flex-col gap-2">
          <h4 className="font-medium">Inbound Call</h4>
          <div className="flex gap-4 ml-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={eventConfig.inbound_call.insert}
                onCheckedChange={(checked) => handleEventConfigChange("inbound_call", "insert", checked as boolean)}
                name="inbound_call_insert"
              />
              New Call
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={eventConfig.inbound_call.update}
                onCheckedChange={(checked) => handleEventConfigChange("inbound_call", "update", checked as boolean)}
                name="inbound_call_update"
              />
              Call Updated
            </label>
            {eventConfig.inbound_call.insert && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => submitTestEvent("inbound_call", "INSERT")}
                disabled={isBusy || !destinationUrl}
                className="ml-auto text-xs"
              >
                Test
              </Button>
            )}
          </div>
        </div>
        
        {/* Inbound SMS Events */}
        <div className="flex flex-col gap-2">
          <h4 className="font-medium">Inbound SMS</h4>
          <div className="flex gap-4 ml-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={eventConfig.inbound_sms.insert}
                onCheckedChange={(checked) => handleEventConfigChange("inbound_sms", "insert", checked as boolean)}
                name="inbound_sms_insert"
              />
              New Message
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={eventConfig.inbound_sms.update}
                onCheckedChange={(checked) => handleEventConfigChange("inbound_sms", "update", checked as boolean)}
                name="inbound_sms_update"
              />
              Message Updated
            </label>
            {eventConfig.inbound_sms.insert && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => submitTestEvent("inbound_sms", "INSERT")}
                disabled={isBusy || !destinationUrl}
                className="ml-auto text-xs"
              >
                Test
              </Button>
            )}
          </div>
        </div>
        
        {/* Outbound Call Events */}
        <div className="flex flex-col gap-2">
          <h4 className="font-medium">Outbound Call</h4>
          <div className="flex gap-4 ml-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={eventConfig.outbound_call.insert}
                onCheckedChange={(checked) => handleEventConfigChange("outbound_call", "insert", checked as boolean)}
                name="outbound_call_insert"
              />
              New Call
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={eventConfig.outbound_call.update}
                onCheckedChange={(checked) => handleEventConfigChange("outbound_call", "update", checked as boolean)}
                name="outbound_call_update"
              />
              Call Updated
            </label>
            {eventConfig.outbound_call.insert && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => submitTestEvent("outbound_call", "INSERT")}
                disabled={isBusy || !destinationUrl}
                className="ml-auto text-xs"
              >
                Test
              </Button>
            )}
          </div>
        </div>
        
        {/* Outbound SMS Events */}
        <div className="flex flex-col gap-2">
          <h4 className="font-medium">Outbound SMS</h4>
          <div className="flex gap-4 ml-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={eventConfig.outbound_sms.insert}
                onCheckedChange={(checked) => handleEventConfigChange("outbound_sms", "insert", checked as boolean)}
                name="outbound_sms_insert"
              />
              New Message
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={eventConfig.outbound_sms.update}
                onCheckedChange={(checked) => handleEventConfigChange("outbound_sms", "update", checked as boolean)}
                name="outbound_sms_update"
              />
              Message Updated
            </label>
            {eventConfig.outbound_sms.insert && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => submitTestEvent("outbound_sms", "INSERT")}
                disabled={isBusy || !destinationUrl}
                className="ml-auto text-xs"
              >
                Test
              </Button>
            )}
          </div>
        </div>
        
        {/* Voicemail Events */}
        <div className="flex flex-col gap-2">
          <h4 className="font-medium">Voicemail</h4>
          <div className="flex gap-4 ml-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={eventConfig.voicemail.insert}
                onCheckedChange={(checked) => handleEventConfigChange("voicemail", "insert", checked as boolean)}
                name="voicemail_insert"
              />
              New Voicemail
            </label>
            {eventConfig.voicemail.insert && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => submitTestEvent("voicemail", "INSERT")}
                disabled={isBusy || !destinationUrl}
                className="ml-auto text-xs"
              >
                Test
              </Button>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-2">
        <label className="text-xl font-semibold dark:text-white">
          Custom Headers
        </label>
        {customHeaders.map(([key, value], index) => {
          return (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={key}
                onChange={(e) =>
                  handleHeaderChange(index, e.target.value, value)
                }
                placeholder="Header Key"
                className="flex-1 rounded-md border border-black bg-transparent px-4 py-2 dark:border-white"
              />
              <input
                type="text"
                value={value}
                onChange={(e) =>
                  handleHeaderChange(index, key, e.target.value)
                }
                placeholder="Header Value"
                className="flex-1 rounded-md border border-black bg-transparent px-4 py-2 dark:border-white"
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
        <Button
          type="button"
          onClick={addNewHeader}
          variant="outline"
          className="border-primary font-Zilla-Slab text-xl font-semibold"
        >
          Add Header
        </Button>
      </div>
      
      <Button
        type="submit"
        className="font-Zilla-Slab text-xl font-semibold"
      >
        Update Webhook
      </Button>
    </Form>
  );
}
