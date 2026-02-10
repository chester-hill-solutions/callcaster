import { useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/CustomCard";
import { toast } from "sonner";

type ApiKeyRecord = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
};

type ApiKeysSectionProps = {
  workspaceId: string;
  hasAccess: boolean;
};

export default function ApiKeysSection({
  workspaceId,
  hasAccess,
}: ApiKeysSectionProps) {
  const listFetcher = useFetcher<{ keys?: ApiKeyRecord[]; error?: string }>({
    key: "api-keys-list",
  });
  const mutateFetcher = useFetcher<
    | { key?: string; id?: string; name?: string; key_prefix?: string; created_at?: string }
    | { success?: boolean }
    | { error?: string }
  >({ key: "api-keys-mutate" });

  const [createName, setCreateName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyReveal, setNewKeyReveal] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId && hasAccess) {
      listFetcher.load(`/api/workspace-api-keys?workspace_id=${encodeURIComponent(workspaceId)}`);
    }
  }, [workspaceId, hasAccess]);

  useEffect(() => {
    if (mutateFetcher.data && "key" in mutateFetcher.data && mutateFetcher.data.key) {
      setNewKeyReveal(mutateFetcher.data.key);
      setShowCreateForm(false);
      setCreateName("");
      listFetcher.load(`/api/workspace-api-keys?workspace_id=${encodeURIComponent(workspaceId)}`);
    }
    if (mutateFetcher.data && "error" in mutateFetcher.data && mutateFetcher.data.error) {
      toast.error(mutateFetcher.data.error);
    }
    if (mutateFetcher.data && "success" in mutateFetcher.data) {
      listFetcher.load(`/api/workspace-api-keys?workspace_id=${encodeURIComponent(workspaceId)}`);
    }
  }, [mutateFetcher.data]);

  const keys: ApiKeyRecord[] = listFetcher.data?.keys ?? [];
  const isLoading = listFetcher.state === "loading" || listFetcher.state === "idle";

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    mutateFetcher.submit(
      { workspace_id: workspaceId, name: createName.trim() },
      {
        method: "POST",
        action: "/api/workspace-api-keys",
        encType: "application/json",
      }
    );
  };

  const handleRevoke = (id: string) => {
    if (!confirm("Revoke this API key? It will stop working immediately.")) return;
    mutateFetcher.submit(
      { id, workspace_id: workspaceId },
      {
        method: "DELETE",
        action: "/api/workspace-api-keys",
        encType: "application/json",
      }
    );
  };

  const copyKey = () => {
    if (newKeyReveal) {
      navigator.clipboard.writeText(newKeyReveal);
      toast.success("API key copied to clipboard");
      setNewKeyReveal(null);
    }
  };

  if (!hasAccess) return null;

  return (
    <Card bgColor="bg-brand-secondary dark:bg-zinc-900 flex-[40%] flex-col flex">
      <div className="flex-1">
        <h3 className="text-center font-Zilla-Slab text-2xl font-bold">
          API Keys
        </h3>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Use API keys to send SMS programmatically (e.g. scripts, Zapier).
        </p>
        <div className="flex flex-col py-4">
          <p className="self-start font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
            Keys
          </p>
          {listFetcher.data?.error && (
            <p className="text-sm text-red-600">{listFetcher.data.error}</p>
          )}
          {isLoading && keys.length === 0 ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : keys.length === 0 && !showCreateForm ? (
            <p className="text-sm text-gray-500">No API keys yet.</p>
          ) : (
            <ul className="flex w-full flex-col gap-2">
              {keys.map((key) => (
                <li
                  key={key.id}
                  className="flex w-full items-center justify-between rounded border border-gray-200 bg-white/50 p-2 dark:border-gray-700 dark:bg-black/20"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{key.name}</p>
                    <p className="truncate font-mono text-xs text-gray-500">
                      {key.key_prefix}…
                    </p>
                    <p className="text-xs text-gray-400">
                      Created {new Date(key.created_at).toLocaleDateString()}
                      {key.last_used_at
                        ? ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRevoke(key.id)}
                    disabled={mutateFetcher.state !== "idle"}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {newKeyReveal && (
            <div className="mt-4 rounded border border-amber-500/50 bg-amber-500/10 p-3">
              <p className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                Copy your key now. We won’t show it again.
              </p>
              <div className="flex gap-2">
                <code className="flex-1 truncate rounded bg-black/10 px-2 py-1 text-sm dark:bg-white/10">
                  {newKeyReveal}
                </code>
                <Button type="button" size="sm" onClick={copyKey}>
                  Copy
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewKeyReveal(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          )}

          {showCreateForm ? (
            <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-2">
              <label className="font-sans text-sm font-semibold uppercase tracking-tighter text-gray-600">
                Key name
              </label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Production, Zapier"
                className="rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-zinc-800"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={!createName.trim() || mutateFetcher.state !== "idle"}
                >
                  Create key
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              className="mt-4 w-full font-Zilla-Slab font-semibold"
              onClick={() => setShowCreateForm(true)}
            >
              Create API key
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
