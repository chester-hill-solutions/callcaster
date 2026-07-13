import { useFetcher } from "react-router";
import { useState } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { useFetcherOnIdle } from "@/hooks/utils/useFetcherOnIdle";
import { useApiKeys, type ApiKeyRecord } from "@/hooks/workspace/useApiKeys";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section, SectionHeader } from "@/components/shared/Section";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PRODUCT_CAPABILITIES } from "@/lib/capabilities";

type ApiKeysSectionProps = {
  workspaceId: string;
  hasAccess: boolean;
  initialKeys?: ApiKeyRecord[];
  defaultShowCreateForm?: boolean;
  variant?: "elevated" | "flat";
};

const SCOPE_OPTIONS = Object.entries(PRODUCT_CAPABILITIES) as Array<
  [keyof typeof PRODUCT_CAPABILITIES, string]
>;

export default function ApiKeysSection({
  workspaceId,
  hasAccess,
  initialKeys = [],
  defaultShowCreateForm = false,
  variant = "elevated",
}: ApiKeysSectionProps) {
  const mutateFetcher = useFetcher<
    | { success?: boolean }
    | { error?: string }
  >({ key: "api-keys-mutate" });
  const createFetcher = useFetcher<{ key?: string; error?: string }>({
    key: "api-keys-create",
  });

  const [showCreateForm, setShowCreateForm] = useState(defaultShowCreateForm);
  const [newKeyReveal, setNewKeyReveal] = useState<string | null>(null);
  const revealedKey = newKeyReveal;

  const { keys, isLoading, error: listError, refresh } = useApiKeys({
    workspaceId,
    hasAccess,
    initialKeys,
  });

  useFetcherOnIdle(createFetcher, (data) => {
    if (data?.key) {
      setNewKeyReveal(data.key);
      setShowCreateForm(false);
      refresh();
    }
  });

  useActionFeedback(createFetcher.data, {
    getError: (data) =>
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: string }).error ?? "")
        : undefined,
    getSuccess: () => false,
  });

  useActionFeedback(mutateFetcher.data, {
    getError: (data) =>
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: string }).error ?? "")
        : undefined,
    onSuccess: (data) => {
      if (data && "success" in data) {
        refresh();
      }
    },
    getSuccess: (data) =>
      Boolean(data && "success" in data && data.success),
  });

  const handleRevoke = (id: string) => {
    if (!confirm("Revoke this API key? It will stop working immediately.")) return;
    mutateFetcher.submit(
      JSON.stringify({ id, workspace_id: workspaceId }),
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
        description="Use API keys to call workspace APIs programmatically. Each key needs explicit capability scopes."
      />
      <div className="space-y-4">
        {listError ? (
          <p className="text-sm text-destructive">{listError}</p>
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
                  {key.scopes && key.scopes.length > 0 ? (
                    <p className="truncate text-xs text-muted-foreground">
                      Scopes: {key.scopes.join(", ")}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Scopes: none (deny-all for capability-gated routes)
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(key.created_at).toLocaleDateString()}
                    {key.expires_at
                      ? ` · Expires ${new Date(key.expires_at).toLocaleDateString()}`
                      : ""}
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
                  disabled={mutateFetcher.state === "submitting"}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}

        {revealedKey ? (
          <div
            className="rounded-md border border-warning/50 bg-warning/10 p-3"
            data-testid="api-key-reveal"
          >
            <p className="mb-2 text-sm font-semibold text-warning">
              Copy your key now. We won’t show it again.
            </p>
            <div className="flex flex-wrap gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-sm">
                {revealedKey}
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

        {showCreateForm && !revealedKey ? (
          <createFetcher.Form
            method="post"
            className="flex flex-col gap-3"
            data-testid="api-key-create-form"
          >
            <input type="hidden" name="formName" value="createApiKey" />
            <FormField htmlFor="api-key-name" label="Key name">
              <Input
                aria-label="Key name"
                id="api-key-name"
                name="name"
                type="text"
                required
                defaultValue=""
                placeholder="e.g. Production, Zapier"
              />
            </FormField>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Capability scopes</legend>
              <p className="text-xs text-muted-foreground">
                Required. Keys only access the scopes you select.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SCOPE_OPTIONS.map(([id, description]) => (
                  <label
                    key={id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="scopes"
                      value={id}
                      className="mt-1"
                    />
                    {`${id} — ${description}`}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-2">
              <Button type="submit" data-testid="api-key-submit">
                Create key
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
            </div>
          </createFetcher.Form>
        ) : (
          <Button
            type="button"
            variant="outline"
            data-testid="api-key-create-button"
            onClick={() => setShowCreateForm(true)}
          >
            Create API key
          </Button>
        )}
      </div>
    </Section>
  );
}
