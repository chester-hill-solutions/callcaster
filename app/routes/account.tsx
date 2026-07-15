export { action, loader } from "./account.loader.server";

import { ShieldCheck } from "lucide-react";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { MetaFunction } from "react-router";

import { Section, SectionHeader } from "@/components/shared/Section";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

type LoaderData = {
  firstName: string;
  lastName: string;
  email: string;
};

type ActionData = {
  error?: string;
  success?: boolean;
};

export const meta: MetaFunction = () => [{ title: "Account — CallCaster" }];

export default function Account() {
  const profile = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

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
            title="Profile"
            description="This information identifies you across your workspaces."
          />
          <Form method="POST" className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField htmlFor="first_name" label="First name" required>
                <Input
                  id="first_name"
                  name="first_name"
                  defaultValue={profile.firstName}
                  autoComplete="given-name"
                  maxLength={100}
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
            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </Form>
        </Section>

        <Section>
          <SectionHeader
            title="Security"
            description="Protect your account with two-factor authentication."
          />
          <Button asChild variant="outline">
            <Link to="/account/security">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Manage account security
            </Link>
          </Button>
        </Section>
      </PageShell>
    </main>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
