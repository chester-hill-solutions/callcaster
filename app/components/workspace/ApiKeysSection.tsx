import { useFetcher } from "react-router";
import { useEffect, useState } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section, SectionHeader } from "@/components/shared/Section";
import { Skeleton } from "@/components/ui/skeleton";
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
  variant?: "elevated" | "flat";
};

export default function ApiKeysSection({
  workspaceId,
  hasAccess,
  variant = "elevated",
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

  useActionFeedback(mutateFetcher.data, {
    getError: (data) =>
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: string }).error ?? "")
        : undefined,
    onSuccess: (data) => {
      if (data && "key" in data && data.key) {
        setNewKeyReveal(data.key);
        setShowCreateForm(false);
        setCreateName("");
        listFetcher.load(
          `/api/workspace-api-keys?workspace_id=${encodeURIComponent(workspaceId)}`,
        );
        return;
      }
      if (data && "success" in data) {
        listFetcher.load(
          `/api/workspace-api-keys?workspace_id=${encodeURIComponent(workspaceId)}`,
        );
      }
    },
    getSuccess: (data) =>
      Boolean(
        data &&
          (("key" in data && Boolean(data.key)) ||
            ("success" in data && data.success)),
      ),
  });

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
    <Section variant={variant}>
      <SectionHeader
        branded={false}
        compact={variant === "flat"}
        title="API Keys"
        description="Use API keys to send SMS programmatically (for example from scripts or Zapier)."
      />
      <div className="space-y-4">
        {listFetcher.data?.error ? (
          <p className="text-sm text-destructive">{listFetcher.data.error}</p>
        ) : null}
        {isLoading && keys.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : keys.length === 0 && !showCreateForm ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{key.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {key.key_prefix}…
                    </p>
                    <p className="text-xs text-muted-foreground">
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

        {newKeyReveal ? (
          <div
            className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3"
            data-testid="api-key-reveal"
          >
              <p className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                Copy your key now. We won’t show it again.
              </p>
            <div className="flex flex-wrap gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-sm">
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
        ) : null}

        {showCreateForm ? (
          <form onSubmit={handleCreate} className="flex flex-col gap-2">
              <FormField htmlFor="api-key-name" label="Key name">
                <Input
                  aria-label="Key name"
                  id="api-key-name"
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Production, Zapier"
              />
              </FormField>
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
          <Button type="button" variant="outline" onClick={() => setShowCreateForm(true)}>
            Create API key
          </Button>
        )}
      </div>
    </Section>
  );
}
