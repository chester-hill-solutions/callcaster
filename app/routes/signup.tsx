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
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { verifyAuth } from "~/lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient: supabase, headers } = await verifyAuth(request);

  const formData = await request.formData();

  const {
    email,
    password,
    confirmEmail,
    confirmPassword,
    firstName,
    lastName,
  } = Object.fromEntries(formData);

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
    return json(
      { emailError: emailError, passwordError: passwordError },
      { headers },
    );
  }

  let userName = email as string;
  userName = userName.split("@")[0];
  const alphaNumericRegex = new RegExp(/([^a-zA-Z\d])/g);
  userName = userName.replace(alphaNumericRegex, "");

  const { data, error } = await supabase.auth.signUp({
    email: email as string,
    password: password as string,
    options: {
      data: {
        username: userName,
        first_name: firstName as string,
        last_name: lastName as string,
      },
    },
  });

  if (error) {
    console.log(error);
    if (error.message === "Password should be at least 6 characters.") {
      return json({ passwordError: error.message }, { headers });
    }
    if (error.message === "Unable to validate email address: invalid format") {
      return json({ error: "Please enter an email address" }, { headers });
    }
    return json({ error: error.message }, { headers });
  }

  // if (data.user) {
  //   return redirect("/signin", { headers });
  // }

  return json({ data, error }, { headers });
};
export const loader = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers } = await verifyAuth(request);
  const { data: serverSession } = await supabaseClient.auth.getSession();

  if (serverSession && serverSession.session) {
    return redirect("/workspaces", { headers });
  }
  return json({ serverSession }, { headers });
};

const fieldLabelStyles =
  "flex w-full flex-col font-Zilla-Slab text-2xl font-bold tracking-[1px] text-black dark:text-white";
const fieldInputStyles =
  "w-full rounded-sm border-2 border-black bg-transparent px-4 py-2 text-black dark:border-white dark:text-white";

function FormFirstPage() {
  return (
    <>
      <Button
        variant={"outline"}
        className="flex min-h-[56px] w-full gap-2 border-2 border-white bg-transparent font-Zilla-Slab text-xl font-semibold"
      >
        <FcGoogle size={"2rem"} />
        Sign in with Google
      </Button>
      <Button
        variant={"outline"}
        className="flex min-h-[56px] w-full gap-2 border-2 border-white bg-transparent font-Zilla-Slab text-xl font-semibold"
      >
        <FaGithub size={"2rem"} />
        Sign in with Github
      </Button>

      <div className="flex w-full items-center justify-center gap-2">
        <div className="w-full border border-brand-secondary" />
        <p className="font-regular font-Zilla-Slab text-xl text-brand-secondary">
          OR
        </p>
        <div className="w-full border border-brand-secondary" />
      </div>

      <Form method="POST" className="flex w-full flex-col gap-4">
        <label
          htmlFor="email"
          className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px]"
        >
          Email
          <input
            type="text"
            name="email"
            id="email"
            className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
          />
        </label>
      </Form>
    </>
  );
}

function FormSecondPage() {
  return <></>;
}

export default function SignUp() {
  const actionData = useActionData<typeof action>();
  const firstPage = FormFirstPage();
  const secondPage = FormSecondPage();
  const [formPage, setFormPage] = useState<ReactNode>(secondPage);
  const [isFirstPage, setIsFirstPage] = useState<boolean>(false);
  const { state } = useNavigation();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const paginationHandler = (page: ReactNode) => {
    setFormPage(page);
  };

  const emailError = actionData?.emailError;
  const passwordError = actionData?.passwordError;

  useEffect(() => {
    /* if (actionData?.data != null && actionData.data.user != null) {
      toast.success(
        "You have successfully signed-up! Redirecting to your dashboard...",
      ); */
    if (fetcher?.data?.success) {
      toast.success("Your request has been sent! We'll be in touch soon.");
      formRef?.current?.reset();
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
  return (
    <main className="flex h-full w-full flex-col items-center justify-center py-16 text-white">
      <div
        id="login-hero"
        className="flex flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-24 py-16 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
      >
        <h1 className="mb-4 font-Zilla-Slab text-6xl font-bold text-brand-primary dark:text-white">
          Create a New Account
        </h1>

        {actionData?.error && (
          <p className="w-full font-Zilla-Slab text-2xl font-bold tracking-[1px] text-brand-primary">
            {actionData.error}
          </p>
        )}

        <Form
          method="POST"
          className="flex w-full flex-col gap-4"
          id="signup-form"
        >
          <div className="flex w-full gap-4">
            <label htmlFor="firstName" className={fieldLabelStyles}>
              {emailError && (
                <p className="font-Zilla-Slab font-bold text-brand-primary">
                  {emailError}
                </p>
              )}
              First Name
              <input
                type="text"
                name="firstName"
                id="firstName"
                className={fieldInputStyles}
              />
            </label>
            <label htmlFor="lastName" className={fieldLabelStyles}>
              {emailError && (
                <p className="font-Zilla-Slab font-bold text-brand-primary">
                  {emailError}
                </p>
              )}
              Last Name
              <input
                type="text"
                name="lastName"
                id="lastName"
                className={fieldInputStyles}
              />
            </label>
          </div>
          <label htmlFor="email" className={fieldLabelStyles}>
            {emailError && (
              <p className="font-Zilla-Slab font-bold text-brand-primary">
                {emailError}
              </p>
            )}
            Email*
            <input
              type="text"
              name="email"
              id="email"
              className={fieldInputStyles}
              required
            />
          </label>
          <label htmlFor="confirmEmail" className={fieldLabelStyles}>
            Confirm Email*
            <input
              type="text"
              name="confirmEmail"
              id="confirmEmail"
              className={fieldInputStyles}
              required
            />
          </label>
          <label htmlFor="password" className={fieldLabelStyles}>
            {passwordError && (
              <p className="font-Zilla-Slab font-bold text-brand-primary">
                {passwordError}
              </p>
            )}
            Password*
            <input
              type="password"
              name="password"
              id="password"
              className={fieldInputStyles}
              required
            />
          </label>
          <label htmlFor="confirmPassword" className={fieldLabelStyles}>
            Confirm Password*
            <input
              type="password"
              name="confirmPassword"
              id="confirmPassword"
              className={fieldInputStyles}
              required
            />
          </label>
        </Form>
        {isFirstPage ? (
          <Button
            className="min-h-[48px] rounded-md bg-brand-primary px-16 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-white hover:text-black"
            type="button"
            onClick={() => {
              paginationHandler(secondPage);
              setIsFirstPage(false);
            }}
          >
            Continue with Email
          </Button>
        ) : (
          <div className="flex gap-4">
            {/* SUBMISSION BUTTON */}
            <Button
              className="min-h-[48px] rounded-md bg-brand-primary px-8 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-white hover:text-black"
              type="submit"
              form="signup-form"
            >
              Sign-Up!
            </Button>
            {/* <Button
              className="min-h-[48px] rounded-md bg-zinc-700 px-8 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-zinc-400 "
              type="button"
              onClick={() => {
                paginationHandler(firstPage);
                setIsFirstPage(true);
              }}
            >
              Back
            </Button> */}
          </div>
        )}
      </div>
      <Toaster richColors visibleToasts={1} />
      <img
        alt="background"
        src="/Hero-1.png"
        className="absolute left-0 top-[10px] z-[-1] h-screen w-screen overflow-hidden object-cover opacity-10"
      />
    </main>
  );
}
const ContactForm = ({ isBusy, formRef, fetcher }) => (
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
            navigate={false}
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
