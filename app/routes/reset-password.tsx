export { loader } from "./reset-password.loader.server";
export { action } from "./reset-password.action.server";

import { data as routeData, Form, useActionData, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "react-router";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/components/shared/AuthCard";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/typography";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

export default function ResetPassword() {
  const actionData = useActionData();

  useActionFeedback(actionData, {
    getSuccess: (data) => data?.success != null,
    successMessage: "Email successfully updated! Redirecting...",
  });

  return (
    <main className="flex min-h-[calc(100vh-80px)] w-full items-center justify-center px-4 py-16 text-foreground">
      <AuthCard
        id="login-hero"
        title="Choose New Password"
        description="Set a new password for your account to complete recovery."
      >
        {actionData?.error ? (
          <Text className="w-full text-center text-destructive">
            {actionData.error.message}
          </Text>
        ) : null}

        <Form
          method="POST"
          className="flex w-full flex-col gap-4"
          id="password-reset-form"
        >
          <FormField htmlFor="password" label="New Password">
            <Input
              type="password"
              name="password"
              id="password"
              required
            />
          </FormField>
          <FormField htmlFor="confirmPassword" label="Confirm New Password">
            <Input
              type="password"
              name="confirmPassword"
              id="confirmPassword"
              required
            />
          </FormField>
          <Button
            className="min-h-[48px] w-full font-Zilla-Slab text-3xl font-bold tracking-[1px]"
            type="submit"
          >
            Reset Password
          </Button>
        </Form>
      </AuthCard>
    </main>
  );
}
