export { action, loader } from "./account.loader.server";

import {
  Form,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { MetaFunction } from "react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Section, SectionHeader } from "@/components/shared/Section";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { Text } from "@/components/ui/typography";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

type LoaderData = {
  firstName: string;
  lastName: string;
  email: string;
  twoFactorEnabled: boolean;
  privileged: boolean;
  enrollRequired: boolean;
};

type ActionData = {
  error?: string;
  success?: boolean;
};

type MfaActionData = {
  error?: string;
  success?: string;
  step?: "verify";
  totpURI?: string | null;
  backupCodes?: string[];
  enabled?: boolean;
};

export const meta: MetaFunction = () => [{ title: "Account — CallCaster" }];

export default function Account() {
  const profile = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const mfaFetcher = useFetcher<MfaActionData>();
  const profileFormRef = useRef<HTMLFormElement>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingMfa, setEditingMfa] = useState(profile.enrollRequired);
  const isSaving = navigation.state === "submitting";
  const mfaData = mfaFetcher.data;
  const twoFactorEnabled = mfaData?.enabled ?? profile.twoFactorEnabled;
  const showingMfaVerification = mfaData?.step === "verify";

  const copyMfaSetupUri = async () => {
    if (!mfaData?.totpURI) return;
    try {
      await navigator.clipboard.writeText(mfaData.totpURI);
      toast.success("MFA setup code copied to clipboard");
    } catch {
      toast.error("Could not copy the MFA setup code");
    }
  };

  useEffect(() => {
    if (actionData?.success) {
      setEditingProfile(false);
    }
  }, [actionData?.success]);

  useEffect(() => {
    if (mfaData?.enabled) {
      setEditingMfa(false);
    }
  }, [mfaData?.enabled]);

  useActionFeedback(actionData, {
    successMessage: "Profile updated.",
  });

  return (
    <main className="px-4 py-8 sm:px-6 sm:py-12">
      <PageShell
        title="Account"
        description="Manage your personal details and sign-in security."
        maxWidth="narrow"
      >
        <Section>
          <SectionHeader
            title="Personal information"
            description="This information identifies you across your workspaces."
            className="mb-3 pb-3"
            actions={
              editingProfile ? (
                <div className="flex gap-2">
                  <Button type="submit" form="profile-form" disabled={isSaving}>
                    {isSaving ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      profileFormRef.current?.reset();
                      setEditingProfile(false);
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={() => setEditingProfile(true)}>
                  Edit
                </Button>
              )
            }
          />
          {actionData?.error ? (
            <Alert variant="destructive" role="alert" className="mb-4">
              <AlertTitle>Could not update your profile</AlertTitle>
              <AlertDescription>{actionData.error}</AlertDescription>
            </Alert>
          ) : null}
          <Form ref={profileFormRef} id="profile-form" method="POST" className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField htmlFor="first_name" label="First name" required>
                <Input
                  id="first_name"
                  name="first_name"
                  defaultValue={profile.firstName}
                  autoComplete="given-name"
                  maxLength={100}
                  disabled={!editingProfile}
                  required
                />
              </FormField>
              <FormField htmlFor="last_name" label="Last name" required>
                <Input
                  id="last_name"
                  name="last_name"
                  defaultValue={profile.lastName}
                  autoComplete="family-name"
                  maxLength={100}
                  disabled={!editingProfile}
                  required
                />
              </FormField>
            </div>
            <FormField
              htmlFor="email"
              label="Email address"
              description="Your email address is also your sign-in identifier."
            >
              <Input
                id="email"
                type="email"
                value={profile.email}
                readOnly
                aria-readonly="true"
              />
            </FormField>
          </Form>
        </Section>

        <Section>
          <SectionHeader
            title="MFA"
            description="Protect your account with multi-factor authentication."
            className="mb-3 pb-3"
            actions={
              editingMfa ? (
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    form="mfa-form"
                    disabled={mfaFetcher.state !== "idle"}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingMfa(false)}
                    disabled={mfaFetcher.state !== "idle"}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={() => setEditingMfa(true)}>
                  Edit
                </Button>
              )
            }
          />
          {profile.enrollRequired && profile.privileged && !twoFactorEnabled ? (
            <Text className="text-sm text-destructive">
              MFA enrollment is required before you can access your workspace.
            </Text>
          ) : null}
          <Text className="text-sm text-muted-foreground">
            Status: {twoFactorEnabled ? "Enabled" : "Not enabled"}
          </Text>
          {mfaData?.error ? (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Could not update MFA</AlertTitle>
              <AlertDescription>{mfaData.error}</AlertDescription>
            </Alert>
          ) : null}
          {mfaData?.success ? <Text className="text-green-600">{mfaData.success}</Text> : null}

          {editingMfa && !twoFactorEnabled && !showingMfaVerification ? (
            <mfaFetcher.Form
              id="mfa-form"
              method="POST"
              action="/account/security"
              className="space-y-4"
            >
              <input type="hidden" name="intent" value="enable" />
              <FormField htmlFor="mfa-password" label="Current password" required>
                <Input
                  id="mfa-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </FormField>
            </mfaFetcher.Form>
          ) : null}

          {editingMfa && showingMfaVerification ? (
            <div className="space-y-4">
              <Alert className="border-warning/50 bg-warning/10">
                <AlertTitle>Connect your authenticator app</AlertTitle>
                <AlertDescription>
                  Copy this setup code into Google Authenticator, Microsoft Authenticator,
                  1Password, or another TOTP authenticator app. Then enter the six-digit
                  code it generates below.
                  {mfaData?.totpURI ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 text-xs">
                        {mfaData.totpURI}
                      </code>
                      <Button type="button" size="sm" onClick={() => void copyMfaSetupUri()}>
                        Copy setup code
                      </Button>
                    </div>
                  ) : null}
                </AlertDescription>
              </Alert>
              {mfaData?.backupCodes?.length ? (
                <Text className="text-sm">
                  Backup codes: {mfaData.backupCodes.join(", ")}
                </Text>
              ) : null}
              <mfaFetcher.Form
                id="mfa-form"
                method="POST"
                action="/account/security"
                className="space-y-4"
              >
                <input type="hidden" name="intent" value="verify" />
                <FormField htmlFor="mfa-code" label="Verification code" required>
                  <Input
                    id="mfa-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                  />
                </FormField>
              </mfaFetcher.Form>
            </div>
          ) : null}

          {!editingMfa && !twoFactorEnabled ? (
            <Text className="text-sm text-muted-foreground">MFA is not enabled.</Text>
          ) : null}
        </Section>
      </PageShell>
    </main>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
