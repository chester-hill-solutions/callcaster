export { loader } from "./signup.loader.server";
export { action } from "./signup.action.server";

import {
  Form,
  NavLink,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { MetaFunction } from "react-router";
import { useRef } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { AuthCard } from "@/components/shared/AuthCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField, FormFieldControl } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Text , Heading } from "@/components/ui/typography";

// Neutral on purpose: this page is registration when signup is open and a
// request-access form when it is closed, and meta cannot read loader data here.
export const meta: MetaFunction = () => [{ title: "Get Started — CallCaster" }];

type FetcherData =
  | {
      success?: boolean;
    }
  | undefined;

type ActionData = {
  error?: string;
};

type LoaderData = {
  signupOpen: boolean;
};

export default function SignUp() {
  const { signupOpen } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const { state } = useNavigation();
  const fetcher = useFetcher<FetcherData>();
  const formRef = useRef<HTMLFormElement>(null);

  useActionFeedback(fetcher.state === "idle" ? fetcher.data : undefined, {
    getSuccess: (data) => Boolean(data?.success),
    successMessage: "Your request has been sent! We'll be in touch soon.",
    onSuccess: () => formRef.current?.reset(),
  });
  useActionFeedback(actionData, {
    getError: (data) => data?.error,
    getSuccess: () => false,
  });

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-8 sm:px-6 lg:px-8">
      <Heading
        branded
        level={1}
        className="animate-fade-in-up my-4 font-Tabac-Slab"
      >
        {signupOpen ? "Sign Up" : "Request Access"}
      </Heading>
      <div className="z-10 flex w-full max-w-6xl justify-center space-y-16">
        {signupOpen ? (
          <RegistrationForm isBusy={state !== "idle"} error={actionData?.error} />
        ) : (
          <ContactForm
            isBusy={state !== "idle"}
            formRef={formRef}
            fetcher={fetcher}
          />
        )}
      </div>
    </main>
  );
}

interface RegistrationFormProps {
  isBusy: boolean;
  error?: string;
}

const RegistrationForm = ({ isBusy, error }: RegistrationFormProps) => (
  <div className="animate-fade-in-up animation-delay-600 mb-16 w-full max-w-md font-Zilla-Slab">
    <AuthCard
      title="Create Account"
      description="Sign up to create a workspace and start calling."
      className="bg-secondary py-2"
      headingAs="h2"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Form method="POST" className="flex w-full flex-col gap-4" id="signup-form">
        <div className="flex w-full gap-4">
          <FormField htmlFor="firstName" label="First Name" className="flex-1">
            <Input type="text" name="firstName" id="firstName" autoComplete="given-name" />
          </FormField>
          <FormField htmlFor="lastName" label="Last Name" className="flex-1">
            <Input type="text" name="lastName" id="lastName" autoComplete="family-name" />
          </FormField>
        </div>
        <FormField htmlFor="email" label="Email">
          <Input
            autoComplete="email"
            type="email"
            name="email"
            id="email"
            required
          />
        </FormField>
        <FormField htmlFor="password" label="Password">
          <Input
            autoComplete="new-password"
            type="password"
            name="password"
            id="password"
            required
            minLength={8}
          />
        </FormField>
      </Form>
      <Button
        className="min-h-[48px] w-full font-Zilla-Slab text-2xl font-bold tracking-[1px]"
        type="submit"
        form="signup-form"
        disabled={isBusy}
      >
        Sign Up
      </Button>
      <NavLink
        to="/signin"
        className="text-center font-Zilla-Slab text-xl font-bold tracking-[1px] text-foreground transition-colors duration-150 hover:text-brand-primary hover:underline"
      >
        Already have an account? Click{" "}
        <span className="text-brand-primary">HERE</span> to sign in!
      </NavLink>
    </AuthCard>
  </div>
);

interface ContactFormProps {
  isBusy: boolean;
  formRef: React.RefObject<HTMLFormElement | null>;
  fetcher: ReturnType<typeof useFetcher<FetcherData>>;
}

const ContactForm = ({ isBusy, formRef, fetcher }: ContactFormProps) => (
  <div className="animate-fade-in-up animation-delay-600 mb-16 w-full max-w-md font-Zilla-Slab">
    <div className="flex flex-wrap gap-8">
      <AuthCard
        title="Request Access"
        description="Registration is currently available by invitation. Contact us to let us know you're interested."
        className="w-full bg-secondary py-2"
        headingAs="h2"
      >
        <fetcher.Form
          className="space-y-4"
          action="/api/contact-form"
          method="POST"
          ref={formRef}
        >
          <input type="hidden" value={"signup"} id="signup" name="signup" />
          <FormField htmlFor="name" label="Name">
            <FormFieldControl>
              <Input
                type="text"
                id="name"
                name="name"
                required
                className="bg-background text-foreground"
              />
            </FormFieldControl>
          </FormField>
          <FormField htmlFor="contact-email" label="Email">
            <FormFieldControl>
              <Input
                type="email"
                id="contact-email"
                name="email"
                required
                className="bg-background text-foreground"
              />
            </FormFieldControl>
          </FormField>
          <FormField htmlFor="message" label="Message">
            <FormFieldControl>
              <Textarea
                id="message"
                name="message"
                rows={4}
                required
                className="border-input bg-background text-foreground"
              />
            </FormFieldControl>
          </FormField>
          <Button
            disabled={isBusy}
            type="submit"
            className="w-full bg-brand-primary text-white transition-all duration-300 hover:bg-brand-secondary"
          >
            Send Message
          </Button>
        </fetcher.Form>
      </AuthCard>
    </div>
  </div>
);
