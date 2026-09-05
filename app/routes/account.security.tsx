export { loader, action } from "./account.security.loader.server";

import { Form, Link, useActionData, useLoaderData } from "react-router";
import { AuthCard } from "@/components/shared/AuthCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/typography";

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
        id="account-security"
      >
        {actionData?.error ? (
          <Alert variant="destructive">
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        ) : null}
        {actionData?.success ? (
          <Text className="text-green-600">{actionData.success}</Text>
        ) : null}

        {!data.twoFactorAvailable ? (
          <Text className="text-sm text-muted-foreground">
            Two-factor authentication is turned off for this deployment. You will
            not be asked for a code at sign-in, and enrollment is unavailable.
          </Text>
        ) : null}

        {data.twoFactorAvailable ? (
          <Text className="text-sm text-muted-foreground">
            Status: {enabled ? "Enabled" : "Not enabled"}
          </Text>
        ) : null}

        {data.twoFactorAvailable && !enabled && !showVerify ? (
          <Form method="POST" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="enable" />
            <FormField htmlFor="password" label="Current password">
              <Input id="password" name="password" type="password" autoComplete="current-password" />
            </FormField>
            <Button type="submit">Set up authenticator app</Button>
          </Form>
        ) : null}

        {showVerify ? (
          <div className="flex flex-col gap-4">
            {actionData?.totpURI ? (
              <Text className="break-all text-xs">{actionData.totpURI}</Text>
            ) : null}
            {actionData?.backupCodes?.length ? (
              <Text className="text-sm">
                Backup codes: {actionData.backupCodes.join(", ")}
              </Text>
            ) : null}
            <Form method="POST" className="flex flex-col gap-4">
              <input type="hidden" name="intent" value="verify" />
              {data.next ? <input type="hidden" name="next" value={data.next} /> : null}
              <FormField htmlFor="code" label="Verification code">
                <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" />
              </FormField>
              <Button type="submit">Confirm setup</Button>
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
