import {
  Form,
  json,
  redirect,
  useActionData,
  useFetcher,
  useNavigate,
  useNavigation,
} from "@remix-run/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";

type ActionData =
  | { emailError: string | null; passwordError: string | null; error?: undefined; data?: undefined }
  | { passwordError: string; emailError?: null; error?: undefined; data?: undefined }
  | { error: string; emailError?: null; passwordError?: null; data?: undefined }
  | { data: unknown; error: null; emailError?: null; passwordError?: null };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient: supabase, headers } = await verifyAuth(request);

  const formData = await request.formData();

  const entries = Object.fromEntries(formData);
  const email: string = typeof entries["email"] === 'string' ? (entries["email"] as string) : '';
  const password: string = typeof entries["password"] === 'string' ? (entries["password"] as string) : '';
  const confirmEmail: string = typeof entries["confirmEmail"] === 'string' ? (entries["confirmEmail"] as string) : '';
  const confirmPassword: string = typeof entries["confirmPassword"] === 'string' ? (entries["confirmPassword"] as string) : '';
  const firstName: string = typeof entries["firstName"] === 'string' ? (entries["firstName"] as string) : '';
  const lastName: string = typeof entries["lastName"] === 'string' ? (entries["lastName"] as string) : '';

  // const passwordPattern = new RegExp(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}/);

  // if (!passwordPattern.test(password.toString())) {
  //   return json({ error: "Password not strong enough!" });
  // }

  let emailError = null;
  let passwordError = null;

  if (email !== confirmEmail) {
    emailError = "Emails do not match";
  }

  if (password !== confirmPassword) {
    passwordError = "Passwords do not match";
  }

  if (emailError || passwordError) {
    return json<ActionData>({ emailError, passwordError }, { headers });
  }

  let userName: string = email ?? "";
  userName = userName.split("@")[0];
  const alphaNumericRegex = new RegExp(/([^a-zA-Z\d])/g);
  userName = userName.replace(alphaNumericRegex, "");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: userName,
        first_name: firstName,
        last_name: lastName,
      },
    },
  });

  if (error) {
    logger.error("Sign-up error", error);
    if (error.message === "Password should be at least 6 characters.") {
      return json<ActionData>({ passwordError: error.message }, { headers });
    }
    if (error.message === "Unable to validate email address: invalid format") {
      return json<ActionData>({ error: "Please enter an email address" }, { headers });
    }
    return json<ActionData>({ error: error.message }, { headers });
  }

  // if (data.user) {
  //   return redirect("/signin", { headers });
  // }

  return json<ActionData>({ data, error: null }, { headers });
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

type FetcherData = {
  success?: boolean;
} | undefined;

export default function SignUp() {
  const actionData = useActionData<ActionData>();
  const { state } = useNavigation();
  const fetcher = useFetcher<FetcherData>();
  const formRef = useRef<HTMLFormElement>(null);

  // legacy error UI removed; keep actionData for toast only

  useEffect(() => {
    /* if (actionData?.data != null && actionData.data.user != null) {
      toast.success(
        "You have successfully signed-up! Redirecting to your dashboard...",
      ); */
    if (fetcher?.data && typeof (fetcher.data as any).success === 'boolean' && (fetcher.data as any).success) {
      toast.success("Your request has been sent! We'll be in touch soon.");
      formRef.current?.reset();
    }
    const timeout = setTimeout(() => /* navigate("/workspaces") */ null, 2000);
    return () => clearTimeout(timeout);
  }, [actionData, fetcher?.data]);

  return (
    <main className="to-gray-150 flex min-h-screen flex-col items-center bg-gradient-to-b from-gray-100 px-4 py-8 dark:from-gray-900 dark:to-black sm:px-6 lg:px-8">
      <h1 className="animate-fade-in-up my-4 font-Tabac-Slab text-4xl font-bold text-brand-primary">
        Sign Up
      </h1>
      <div className="z-10 flex w-full max-w-6xl justify-center space-y-16">
        <ContactForm isBusy={state !== "idle"} formRef={formRef} fetcher={fetcher}/>
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
      <Card className="min-w-[400px] flex-initial bg-secondary py-8 dark:bg-zinc-800">
        <CardContent>
          <div className="flex w-full justify-center">
            <p className="max-w-[75%] p-4 text-center">
              Registration is currently available by invitation. Contact us to
              let us know you're interested.
            </p>
          </div>
          <fetcher.Form
            className="space-y-4"
            action="/api/contact-form"
            method="POST"
            ref={formRef}
          >
            <input type="hidden" value={"signup"} id="signup" name="signup" />
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-700 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-700 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-700 dark:text-white"
              ></textarea>
            </div>
            <Button
              disabled={isBusy}
              type="submit"
              className="w-full bg-brand-primary text-white transition-all duration-300 hover:bg-brand-secondary"
            >
              Send Message
            </Button>
          </fetcher.Form>
        </CardContent>
      </Card>
    </div>
  </div>
);
