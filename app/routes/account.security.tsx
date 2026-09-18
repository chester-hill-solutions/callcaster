export { loader, action } from "./account.security.loader.server";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { AuthCard } from "@/components/shared/AuthCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/typography";

/**
 * Icon-only copy button: copy icon → success checkmark for a moment (#1316).
 * Clipboard can be unavailable (non-secure contexts, jsdom); fail silently.
 */
function SecretCopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — keep the button inert rather than erroring.
    }
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="size-8 shrink-0 px-0"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? `${label} copied` : `Copy ${label}`}
      aria-pressed={copied}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </Button>
  );
}

export default function AccountSecurity() {
  const data = useLoaderData<{
    twoFactorAvailable: boolean;
    privileged: boolean;
    twoFactorEnabled: boolean;
    enrollRequired: boolean;
    next: string | null;
    privilegedRoles: readonly string[];
  }>();
  const actionData = useActionData<{
    error?: string;
    success?: string;
    step?: string;
    totpURI?: string | null;
    backupCodes?: string[];
    enabled?: boolean;
  }>();

  const showVerify = actionData?.step === "verify";
  const enabled = actionData?.enabled ?? data.twoFactorEnabled;

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-12">
      <Button asChild variant="ghost" className="w-fit">
        <Link to="/account">← Back to account</Link>
      </Button>
      <AuthCard
        title="Account security"
        description={
          data.enrollRequired && data.privileged
            ? "Two-factor authentication is required for owner and admin roles."
            : "Manage two-factor authentication for your account."
        }
        headerContent={
          data.twoFactorAvailable ? (
            <div className="flex justify-end pt-1">
              <Badge variant={enabled ? "default" : "outline"}>
                {enabled ? "Enabled" : "Not enabled"}
              </Badge>
            </div>
          ) : undefined
        }
        id="account-security"
      >
        {actionData?.error ? (
          <Alert variant="destructive" className="py-3">
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        ) : null}
        {actionData?.success ? (
          <Alert variant="default" className="py-3">
            <AlertDescription>{actionData.success}</AlertDescription>
          </Alert>
        ) : null}

        {!data.twoFactorAvailable ? (
          <Text className="text-sm text-muted-foreground">
            Two-factor authentication is turned off for this deployment. You will
            not be asked for a code at sign-in, and enrollment is unavailable.
          </Text>
        ) : null}

        {data.twoFactorAvailable && !enabled && !showVerify ? (
          <Form method="POST" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="enable" />
            <FormField htmlFor="password" label="Current password">
              <Input id="password" name="password" type="password" autoComplete="current-password" />
            </FormField>
            <Button type="submit" className="ml-auto min-w-[8rem]">
              Next
            </Button>
          </Form>
        ) : null}

        {showVerify ? (
          <div className="flex flex-col gap-4">
            {actionData?.totpURI ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                  <code className="min-w-0 break-all text-xs">{actionData.totpURI}</code>
                  <SecretCopyButton value={actionData.totpURI} label="secret" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Scan this with your authenticator app, or copy it into one that
                  accepts a manual secret.
                </p>
              </div>
            ) : null}
            {actionData?.backupCodes?.length ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                  <span className="min-w-0 break-all font-mono text-sm">
                    {actionData.backupCodes.join("  ")}
                  </span>
                  <SecretCopyButton value={actionData.backupCodes.join("\n")} label="backup codes" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Save this in a secure place. Each code can only be used once.
                </p>
              </div>
            ) : null}
            <Form method="POST" className="flex flex-col gap-4">
              <input type="hidden" name="intent" value="verify" />
              {data.next ? <input type="hidden" name="next" value={data.next} /> : null}
              <FormField htmlFor="code" label="Verification code">
                <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" />
              </FormField>
              <Button type="submit" className="ml-auto min-w-[8rem]">
                Confirm setup
              </Button>
            </Form>
          </div>
        ) : null}

        {data.twoFactorAvailable && enabled && !data.privileged ? (
          <Form method="POST" className="mt-4 flex flex-col gap-4 border-t pt-4">
            <input type="hidden" name="intent" value="disable" />
            <FormField htmlFor="disable-password" label="Current password">
              <Input
                id="disable-password"
                name="password"
                type="password"
                autoComplete="current-password"
              />
            </FormField>
            <Button type="submit" variant="outline">
              Disable 2FA
            </Button>
          </Form>
        ) : null}
      </AuthCard>
    </main>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";