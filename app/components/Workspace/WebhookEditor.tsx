import { Form, useFetcher } from "@remix-run/react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";

type EventType = "INSERT" | "UPDATE";

type WebhookEditorProps = {
  initialWebhook: {
    destination_url: string;
    event: EventType[];
    custom_headers?: Record<string, string>;
  } | null;
  userId: string;
  workspaceId: string;
};

const insertEvent = (workspace: string) => ({
  type: "INSERT",
  record: {
    id: 12345,
    contact_id: 67890,
    campaign_id: 246,
    result: JSON.stringify({}),
    disposition: "pending",
    created_at: new Date().toISOString(),
    user_id: "a656121d-17af-414c-97c7-71f2008f8f14",
    ended_at: null,
    answered_at: null,
    workspace,
  },
  old_record: null,
});

const updateEvent = (workspace: string) => ({
  type: "UPDATE",
  record: {
    id: 12345,
    contact_id: 67890,
    campaign_id: 246,
    result: JSON.stringify({ duration: 120, outcome: "successful" }),
    disposition: "completed",
    created_at: "2024-09-04T14:33:21.470Z",
    user_id: "a656121d-17af-414c-97c7-71f2008f8f14",
    ended_at: new Date().toISOString(),
    answered_at: "2024-09-04T14:33:25.000Z",
    workspace,
  },
  old_record: {
    id: 12345,
    contact_id: 67890,
    campaign_id: 246,
    result: JSON.stringify({}),
    disposition: "pending",
    created_at: "2024-09-04T14:33:21.470Z",
    user_id: "a656121d-17af-414c-97c7-71f2008f8f14",
    ended_at: null,
    answered_at: null,
    workspace,
  },
});

export default function WebhookEditor({
  initialWebhook,
  userId,
  workspaceId,
}: WebhookEditorProps) {
  const [destinationUrl, setDestinationUrl] = useState(
    initialWebhook?.destination_url || "",
  );
  const [insertChecked, setInsertChecked] = useState(
    initialWebhook?.event?.includes("INSERT") || false,
  );
  const [updateChecked, setUpdateChecked] = useState(
    initialWebhook?.event?.includes("UPDATE") || false,
  );
  const [customHeaders, setCustomHeaders] = useState<Array<[string, string]>>(
    Object.entries(initialWebhook?.custom_headers || {}),
  );
  const formRef = useRef<HTMLFormElement | null>(null);
  const fetcher = useFetcher();
  const isBusy = fetcher.state !== "idle";

  const submitTestEvent = (eventType: "INSERT" | "UPDATE") => {
    if (isBusy) return;
    if (eventType === "INSERT") {
      const event = insertEvent(workspaceId);
      fetcher.submit(
        {
          event,
          destination_url: destinationUrl,
          custom_headers: customHeaders,
        },
        {
          method: "POST",
          action: "/api/test-webhook",
          encType: "application/json",
          navigate: false,
        },
      );
    } else if (eventType === "UPDATE") {
      const event = updateEvent(workspaceId);
      fetcher.submit(
        {
          event,
          destination_url: destinationUrl,
          custom_headers: customHeaders,
        },
        {
          method: "POST",
          action: "/api/test-webhook",
          encType: "application/json",
          navigate: false,
        },
      );
    } else {
      throw new Error("Invalid event type");
    }
  };

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    const formData = new FormData()
    formData.append("formName", "updateWebhook")
    formData.append("userId", userId)
    formData.append("destinationUrl", destinationUrl)
    formData.append("insertEvent", insertChecked)
    formData.append("updateEvent", updateChecked)
    formData.append("customHeaders", JSON.stringify(customHeaders))
    fetcher.submit(formData,{
        method:"post",
        navigate:false
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
    console.log(customHeaders[index])
    setCustomHeaders((prev) => prev.filter((i) => i !== customHeaders[index]));
  };


  return (
    <Form method="POST" className="flex w-full flex-col gap-2" ref={formRef} onSubmit={handleSubmit}>
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
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={insertChecked}
            onCheckedChange={(checked) => setInsertChecked(checked as boolean)}
            name="insertEvent"
          />
          INSERT
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={updateChecked}
            onCheckedChange={(checked) => setUpdateChecked(checked as boolean)}
            name="updateEvent"
          />
          UPDATE
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-xl font-semibold dark:text-white">
          Custom Headers
        </label>
        {Object.entries(customHeaders).map(([index, [key, value]]) => {
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
          className="flex-1 border-primary font-Zilla-Slab text-xl font-semibold"
        >
          Add Header
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          className="flex-1 font-Zilla-Slab text-xl font-semibold"
        >
          Update Webhook
        </Button>
        <Button
          type="button"
          variant={"outline"}
          onClick={() => submitTestEvent("INSERT")}
          className="flex-1 border-primary font-Zilla-Slab text-xl font-semibold"
          disabled={!insertChecked || !destinationUrl}
        >
          Test INSERT
        </Button>
        <Button
          type="button"
          variant={"outline"}
          onClick={() => submitTestEvent("UPDATE")}
          className="flex-1 border-primary font-Zilla-Slab text-xl font-semibold"
          disabled={!updateChecked || !destinationUrl}
        >
          Test UPDATE
        </Button>
      </div>
    </Form>
  );
}
