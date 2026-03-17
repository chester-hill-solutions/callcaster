import { json, redirect } from "@remix-run/node";
import { Form, NavLink, useActionData } from "@remix-run/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { AuthCard } from "@/components/shared/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { logger } from "@/lib/logger.server";
import { Text } from "@/components/ui/typography";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get('next');

  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (!error) {
    if (next && next.startsWith('/') && !next.startsWith('/signin')) {
      return redirect(next, {headers});
    }
    return redirect("/workspaces", { headers });
  }
  logger.error("Sign-in error", error);
  return json({ error: error.message });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const {supabaseClient, headers} = createSupabaseServerClient(request);
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {
    return redirect("/workspaces", { headers });
  }
  return json({ user }, { headers });
};

export default function SignIn() {
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (actionData?.error != null) {
      toast.error(actionData.error, { duration: 4000 });
    }
  }, [actionData]);

  return (
    <main className="relative flex min-h-[calc(100vh-80px)] items-center justify-center px-4 py-12 text-foreground">
      <AuthCard
        title="Login"
        description="Sign in to manage your workspaces, calls, and messaging."
        id="login-hero"
      >
        {actionData?.error ? (
          <Text className="block text-center text-destructive sm:hidden">
            {actionData.error}
          </Text>
        ) : null}
        <Form
          method="POST"
          className="flex w-full flex-col gap-4"
          id="signin-form"
        >
          <FormField htmlFor="email" label="Email">
            <Input
              autoComplete="email"
              type="text"
              name="email"
              id="email"
              className="border-border bg-white/90 dark:bg-background/80"
            />
          </FormField>

          <FormField htmlFor="password" label="Password">
            <Input
              autoComplete="current-password"
              type="password"
              name="password"
              id="password"
              className="border-border bg-white/90 dark:bg-background/80"
            />
          </FormField>
        </Form>

        <Button
          className="min-h-[48px] w-full font-Zilla-Slab text-2xl font-bold tracking-[1px]"
          type="submit"
          form="signin-form"
        >
          Login
        </Button>
        <NavLink
          to={"/signup"}
          className="text-center font-Zilla-Slab text-xl font-bold tracking-[1px] text-foreground transition-all duration-150 hover:text-brand-primary hover:underline dark:text-secondary-foreground dark:hover:text-brand-primary"
        >
          Don't Have an Account Yet? Click{" "}
          <span className="text-brand-primary">HERE</span> to Sign-Up!
        </NavLink>
        <NavLink
          to={"/remember"}
          className="font-Zilla-Slab text-xl font-bold tracking-[1px] text-muted-foreground hover:text-brand-primary hover:underline dark:text-brand-tertiary"
        >
          I forgot my password
        </NavLink>
      </AuthCard>
      <img
        alt="background"
        src="/Hero-1.png"
        className="absolute left-0 top-[10px] z-[-1] h-screen overflow-hidden object-cover opacity-10"
      />
    </main>
  );
}
