import {
  Form,
  json,
  useActionData,
  redirect,
  useNavigate,
} from "@remix-run/react";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { ReactNode, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { Button } from "~/components/ui/button";
import { toast, Toaster } from "sonner";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient: supabase, headers } =
    createSupabaseServerClient(request);

  const formData = await request.formData();

  const { email, password, confirmEmail, confirmPassword } =
    Object.fromEntries(formData);

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

  const { data, error } = await supabase.auth.signUp({
    email: email as string,
    password: password as string,
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
  //   // console.log(data);
  //   return redirect("/signin", { headers });
  // }

  return json({ data, error }, { headers });
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

  const navigate = useNavigate();

  const paginationHandler = (page: ReactNode) => {
    setFormPage(page);
  };

  const emailError = actionData?.emailError;
  const passwordError = actionData?.passwordError;

  if (actionData?.data != null && actionData.data.user != null) {
    toast.success(
      "You have successfully signed-up! Redirecting to your dashboard...",
    );
    setTimeout(() => navigate("/signin"), 3000);
  }

  return (
    <main className="flex h-full w-full flex-col items-center justify-center py-16 text-white">
      <div
        id="login-hero"
        className="flex flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-28 py-16 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
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
          <div className="my-2"></div>
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
    </main>
  );
}
