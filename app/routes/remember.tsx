export { action } from "./remember.action.server";

import { Form, useActionData } from "react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { AuthCard } from "@/components/shared/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

type ActionData = {
  data: unknown;
  error: string | { message: string } | null;
} | undefined;

export default function Remember() {
  const actionData = useActionData<ActionData>();

  useEffect(() => {
    if (actionData?.error) {
      toast.error(
        typeof actionData.error === "string"
          ? actionData.error
          : actionData.error?.message,
      );
    }
  }, [actionData]);

  return (
    <main className="flex min-h-[calc(100vh-80px)] items-center justify-center px-4 py-12 text-slate-800">
      <AuthCard
        id="login-hero"
        title="Reset Password"
        description="Enter your email address and we'll send you a recovery link."
      >
        <Form
          id="forgot-password-form"
          method="POST"
          className="mb-auto flex w-full flex-col gap-4"
        >
          <FormField htmlFor="email" label="Email">
            <Input
              type="text"
              name="email"
              id="email"
              className="border-border bg-white/90 dark:bg-background/80"
            />
          </FormField>
          <Button
            className="min-h-[48px] w-full font-Zilla-Slab text-xl tracking-[1px]"
            type="submit"
          >
            Reset
          </Button>
        </Form>
      </AuthCard>
    </main>
  );
}
