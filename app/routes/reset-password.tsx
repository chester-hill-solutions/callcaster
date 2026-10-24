export { loader } from "./reset-password.loader.server";
export type { ResetPasswordLoaderData } from "./reset-password.loader.server";
export { action } from "./reset-password.action.server";

import { Form, Link, useActionData, useLoaderData, useNavigate } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/components/shared/AuthCard";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MIN_LENGTH_MESSAGE,
  resetLinkProblem,
} from "../../shared/auth-policy";
import type { ResetPasswordLoaderData } from "./reset-password.loader.server";

export default function ResetPassword() {
  const actionData = useActionData();
  const { token, error } = useLoaderData<ResetPasswordLoaderData>();
  const navigate = useNavigate();
  // A refused token and a missing token read differently to a user; both hide
  // the form, and any other error value does not (#2661).
  const resetLinkMessage = resetLinkProblem(token, error);

  useActionFeedback(actionData, {
    getError: (data) => data?.error?.message,
    getSuccess: (data) => data?.success === true,
    successMessage: "Password updated. You can now sign in.",
    onSuccess: () => navigate("/signin", { replace: true }),
  });

  return (
    <main className="flex min-h-[calc(100vh-80px)] w-full items-center justify-center px-4 py-16 text-foreground">
      <AuthCard
        id="login-hero"
        title="Choose New Password"
        description="Set a new password for your account to complete recovery."
      >
        {resetLinkMessage ? (
          // Say the link cannot be used on arrival, instead of rendering a form
          // that can only fail on submit (#2075, #2661). The title still says
          // "Choose New Password" above, so the state is stated, not implied.
          <div className="flex w-full flex-col gap-4">
            <Alert variant="destructive">
              <AlertDescription>{resetLinkMessage}</AlertDescription>
            </Alert>
            <Button asChild className="min-h-[48px] w-full">
              <Link to="/remember">Request a new link</Link>
            </Button>
          </div>
        ) : (
          <Form
            method="POST"
            className="flex w-full flex-col gap-4"
            id="password-reset-form"
          >
            <FormField
              htmlFor="password"
              label="New Password"
              description={PASSWORD_MIN_LENGTH_MESSAGE}
            >
              <Input
                autoComplete="new-password"
                type="password"
                name="password"
                id="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
            </FormField>
            <FormField htmlFor="confirmPassword" label="Confirm New Password">
              <Input
                autoComplete="new-password"
                type="password"
                name="confirmPassword"
                id="confirmPassword"
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
            </FormField>
            <Button
              className="min-h-[48px] w-full font-Zilla-Slab text-3xl font-bold tracking-[1px]"
              type="submit"
            >
              Reset Password
            </Button>
          </Form>
        )}
      </AuthCard>
    </main>
  );
}
