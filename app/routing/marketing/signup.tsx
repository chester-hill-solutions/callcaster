import {
  Form,
  json,
  redirect,
  useFetcher,
  useNavigation,
} from "@remix-run/react";
import { ReactNode, useRef, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { toast } from "sonner";
import { useToastOnNewJsonPayload } from "@/hooks/utils/useToastOnNewJsonPayload";
import { AuthCard } from "@/components/shared/AuthCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";
import { Heading } from "@/components/ui/typography";

type ActionData =
  | {
      emailError: string | null;
      passwordError: string | null;
      error?: undefined;
      data?: undefined;
    }
  | {
      passwordError: string;
      emailError?: null;
      error?: undefined;
      data?: undefined;
    }
  | { error: string; emailError?: null; passwordError?: null; data?: undefined }
  | { data: unknown; error: null; emailError?: null; passwordError?: null };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { headers } = createSupabaseServerClient(request);

  return json<ActionData>(
    {
      error:
        "Registration is invite-only. Please use your invitation link or request access through the contact form.",
    },
    { headers, status: 403 },
  );
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient, headers } = await verifyAuth(request);
  const { data: serverSession } = await supabaseClient.auth.getSession();

  if (serverSession && serverSession.session) {
    return redirect("/workspaces", { headers });
  }
  return json({ serverSession }, { headers });
};

// Removed unused legacy styles

type FetcherData =
  | {
      success?: boolean;
    }
  | undefined;

export default function SignUp() {
  const { state } = useNavigation();
  const fetcher = useFetcher<FetcherData>();
  const formRef = useRef<HTMLFormElement>(null);

  useToastOnNewJsonPayload(
    fetcher.data,
    Boolean(
      fetcher.data &&
        typeof (fetcher.data as { success?: boolean }).success === "boolean" &&
        (fetcher.data as { success: boolean }).success,
    ),
    () => {
      toast.success("Your request has been sent! We'll be in touch soon.");
      formRef.current?.reset();
    },
  );

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-8 sm:px-6 lg:px-8">
      <Heading
        branded
        level={1}
        className="animate-fade-in-up my-4 font-Tabac-Slab"
      >
        Sign Up
      </Heading>
      <div className="z-10 flex w-full max-w-6xl justify-center space-y-16">
        <ContactForm
          isBusy={state !== "idle"}
          formRef={formRef}
          fetcher={fetcher}
        />
      </div>
    </main>
  );
}
interface ContactFormProps {
  isBusy: boolean;
  formRef: React.RefObject<HTMLFormElement>;
  fetcher: ReturnType<typeof useFetcher<FetcherData>>;
}

const ContactForm = ({ isBusy, formRef, fetcher }: ContactFormProps) => (
  <div className="animate-fade-in-up animation-delay-600 mb-16 font-Zilla-Slab">
    <div className="flex flex-wrap gap-8">
      <AuthCard
        title="Request Access"
        description="Registration is currently available by invitation. Contact us to let us know you're interested."
        className="min-w-[400px] flex-initial bg-secondary py-2"
      >
        <fetcher.Form
          className="space-y-4"
          action="/api/contact-form"
          method="POST"
          ref={formRef}
        >
          <input type="hidden" value={"signup"} id="signup" name="signup" />
          <FormField htmlFor="name" label="Name">
            <Input
              type="text"
              id="name"
              name="name"
              required
              className="bg-background text-foreground"
            />
          </FormField>
          <FormField htmlFor="email" label="Email">
            <Input
              type="email"
              id="email"
              name="email"
              required
              className="bg-background text-foreground"
            />
          </FormField>
          <FormField htmlFor="message" label="Message">
            <Textarea
              id="message"
              name="message"
              rows={4}
              required
              className="border-input bg-background text-foreground"
            />
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
