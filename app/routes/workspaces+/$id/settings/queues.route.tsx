export { loader } from "./queues.loader.server";
export { action } from "./queues.action.server";

import { Link, useFetcher, useLoaderData, useOutletContext } from "react-router";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/typography";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useState } from "react";

type Queue = {
  id: number;
  name: string;
  description: string | null;
  workspace_id: string;
  hold_audio: string | null;
};

type QueueMember = {
  id: number;
  queue_id: number;
  user_id: string;
  workspace_id: string;
};

type WorkspaceNumber = {
  id: number;
  phone_number: string | null;
  friendly_name: string | null;
  inbound_queue_id: number | null;
};

type LoaderData = {
  queues: Queue[];
  members: QueueMember[];
  numbers: WorkspaceNumber[];
  workspaceId: string;
};

type QueueFormData = {
  name: string;
  description: string;
};

export default function QueueSettings() {
  const { queues, members, numbers, workspaceId } = useLoaderData<LoaderData>();
  useOutletContext<{ }>();
  const fetcher = useFetcher();
  const [editing, setEditing] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const getQueueMembers = (queueId: number) =>
    members.filter((m) => m.queue_id === queueId);

  const QueueForm = ({ initial, onSubmit, onCancel }: {
    initial?: Queue;
    onSubmit: (data: QueueFormData) => void;
    onCancel: () => void;
  }) => {
    const [name, setName] = useState(initial?.name || "");
    const [description, setDescription] = useState(initial?.description || "");

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name, description });
        }}
        className="flex flex-col gap-2 rounded-sm bg-brand-secondary p-4"
      >
        <FormField htmlFor="queue-name" label="Queue Name">
          <Input
            id="queue-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Sales Team"
          />
        </FormField>
        <FormField htmlFor="queue-desc" label="Description">
          <Input
            id="queue-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </FormField>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            {initial ? "Save" : "Create"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    );
  };

  return (
    <main className="mt-8 flex h-fit flex-col">
      <div className="flex justify-between px-4">
        <Heading level={2} branded={false}>
          Queue Settings
        </Heading>
        <Button asChild variant="outline">
          <Link to=".." relative="path">Back</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {queues.length === 0 && !showCreate && (
          <p className="text-center text-muted-foreground">
            No queues yet. Create one to start routing inbound calls to agents.
          </p>
        )}

        {queues.map((queue) => (
          <div
            key={queue.id}
            className="rounded-sm bg-brand-secondary p-4 dark:border-2 dark:border-white dark:bg-transparent"
          >
            {editing === queue.id ? (
              <QueueForm
                initial={queue}
                onCancel={() => setEditing(null)}
                onSubmit={(data) => {
                  fetcher.submit(
                    {
                      _action: "update-queue",
                      id: String(queue.id),
                      name: data.name,
                      description: data.description,
                      workspace_id: workspaceId,
                    },
                    { method: "PUT", encType: "application/json" },
                  );
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-Zilla-Slab text-xl font-bold">{queue.name}</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(queue.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Delete queue?")) {
                          fetcher.submit(
                            {
                              _action: "delete-queue",
                              id: String(queue.id),
                              workspace_id: workspaceId,
                            },
                            { method: "DELETE", encType: "application/json" },
                          );
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {queue.description && (
                  <p className="text-sm text-muted-foreground">{queue.description}</p>
                )}
              </>
            )}

            <div className="mt-4">
              <h4 className="mb-2 font-semibold">
                Assigned Agents ({getQueueMembers(queue.id).length})
              </h4>
              <select
                className="mb-2 w-full rounded-md border-2 border-border bg-background px-2 py-2 text-foreground"
                defaultValue=""
                onChange={(e) => {
                  const userId = e.target.value;
                  if (!userId) return;
                  fetcher.submit(
                    {
                      _action: "add-member",
                      queue_id: String(queue.id),
                      user_id: userId,
                      workspace_id: workspaceId,
                    },
                    { method: "PATCH", encType: "application/json" },
                  );
                }}
              >
                <option value="" disabled>Add agent...</option>
                {Array.from(
                  new Set(members.filter((m) => m.queue_id !== queue.id).map((m) => m.user_id)),
                ).length === 0 && (
                  <option value="" disabled>All agents already assigned</option>
                )}
              </select>
              <div className="flex flex-wrap gap-2">
                {getQueueMembers(queue.id).map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 rounded-sm bg-background px-3 py-1 text-sm"
                  >
                    <span>{member.user_id.substring(0, 8)}...</span>
                    <button
                      className="text-destructive hover:underline"
                      onClick={() => {
                        fetcher.submit(
                          {
                            _action: "remove-member",
                            queue_id: String(queue.id),
                            user_id: member.user_id,
                            workspace_id: workspaceId,
                          },
                          { method: "PATCH", encType: "application/json" },
                        );
                      }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <h4 className="mb-2 font-semibold">Linked Numbers</h4>
              <div className="flex flex-wrap gap-2">
                {numbers
                  .filter((n) => n.inbound_queue_id === queue.id)
                  .map((n) => (
                    <span
                      key={n.id}
                      className="rounded-sm bg-background px-3 py-1 text-sm"
                    >
                      {n.phone_number || n.friendly_name || `#${n.id}`}
                    </span>
                  ))}
                {numbers.filter((n) => n.inbound_queue_id === queue.id).length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    No numbers linked. Edit a phone number in Settings &gt; Numbers to link it.
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {showCreate && (
          <QueueForm
            onCancel={() => setShowCreate(false)}
            onSubmit={(data) => {
              fetcher.submit(
                {
                  _action: "create-queue",
                  name: data.name,
                  description: data.description,
                  workspace_id: workspaceId,
                },
                { method: "POST", encType: "application/json" },
              );
              setShowCreate(false);
            }}
          />
        )}

        {!showCreate && (
          <Button onClick={() => setShowCreate(true)}>
            Create Queue
          </Button>
        )}
      </div>
    </main>
  );
}
