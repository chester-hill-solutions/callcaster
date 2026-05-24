export { loader } from "./signin.loader.server";
export { action } from "./signin.action.server";

import { data as routeData, redirect, Form, NavLink, useActionData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { AuthCard } from "@/components/shared/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";


import { Text } from "@/components/ui/typography";





export default function SignIn() {
  const actionData = useActionData();

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
