export { loader, action } from "./account.security.loader.server";

import { Form, useActionData, useLoaderData } from "react-router";
import { AuthCard } from "@/components/shared/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/typography";

export default function AccountSecurity() {
  const data = useLoaderData<typeof import("./account.security.loader.server").loader>();
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
          <Text className="text-destructive">{actionData.error}</Text>
        ) : null}
        {actionData?.success ? (
          <Text className="text-green-600">{actionData.success}</Text>
        ) : null}

        <Text className="text-sm text-muted-foreground">
          Status: {enabled ? "Enabled" : "Not enabled"}
        </Text>

        {!enabled && !showVerify ? (
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
              <FormField htmlFor="code" label="Verification code">
                <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" />
              </FormField>
              <Button type="submit">Confirm setup</Button>
            </Form>
          </div>
        ) : null}

        {enabled && !data.privileged ? (
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
