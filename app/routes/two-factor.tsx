export { loader } from "./two-factor.loader.server";
export { action } from "./two-factor.action.server";

import { Form, useLoaderData, useActionData } from "react-router";
import { AuthCard } from "@/components/shared/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/typography";

export default function TwoFactorVerify() {
  const { methods, next } = useLoaderData<{
    methods: string[];
    next: string | null;
  }>();
  const actionData = useActionData<{ error?: string }>();

  return (
    <main className="relative flex min-h-[calc(100vh-80px)] items-center justify-center px-4 py-12 text-foreground">
      <AuthCard
        title="Two-factor authentication"
        description="Enter the code from your authenticator app to finish signing in."
        id="two-factor-hero"
      >
        {actionData?.error ? (
          <Text className="block text-center text-destructive">{actionData.error}</Text>
        ) : null}
        <Form method="POST" className="flex w-full flex-col gap-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <FormField htmlFor="code" label="Authentication code">
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={8}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="trustDevice" defaultChecked />
            Trust this device for 30 days
          </label>
          <Button type="submit" className="w-full">
            Verify
          </Button>
        </Form>
        <Text className="text-center text-sm text-muted-foreground">
          Methods: {methods.join(", ")}
        </Text>
      </AuthCard>
    </main>
  );
}
