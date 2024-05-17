import { json, useActionData, redirect, Link, Form } from "@remix-run/react";
import { createSupabaseServerClient } from "~/lib/supabase.server";

import { Button } from "~/components/ui/button";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { ReactNode, useEffect, useState } from "react";

export const action = async ({ request }: { request: Request }) => {
  const formData = await request.formData();
  const { email, password, confirmEmail, confirmPassword } =
    Object.fromEntries(formData);

  const passwordPattern = new RegExp(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}/);

  if (!passwordPattern.test(password.toString())) {
    return json({ error: "Password not strong enough!" });
  }

  if ((email as string) !== (confirmEmail as string)) {
    return json({ error: "Emails do not match" });
  }

  if ((password as string) !== (confirmPassword as string)) {
    return json({ error: "Passwords do not match" });
  }

  // const { supabaseClient: supabase, headers } =
  //   createSupabaseServerClient(request);
  // const { data, error } = await supabase.auth.signUp({
  //   email: email as string,
  //   password: password as string,
  // });

  // if (error) {
  //   return json({ error: error.message }, { headers });
  // }

  // if (data.user) {
  //   console.log(data);
  //   // return redirect("/signin");
  //   // return json({ data: data });

  //   return null;
  // }

  return null;
};

function FormFirstPage() {
  return (
    <>
      <Button
        variant={"outline"}
        className="font-Zilla-Slab flex min-h-[56px] w-full gap-2 border-2 border-white bg-transparent text-xl font-semibold"
      >
        <FcGoogle size={"2rem"} />
        Sign in with Google
      </Button>
      <Button
        variant={"outline"}
        className="font-Zilla-Slab flex min-h-[56px] w-full gap-2 border-2 border-white bg-transparent text-xl font-semibold"
      >
        <FaGithub size={"2rem"} />
        Sign in with Github
      </Button>

      <div className="flex w-full items-center justify-center gap-2">
        <div className="w-full border border-brand-secondary" />
        <p className="font-Zilla-Slab font-regular text-xl text-brand-secondary">
          OR
        </p>
        <div className="w-full border border-brand-secondary" />
      </div>

      <Form method="POST" className="flex w-full flex-col gap-4">
        <label
          htmlFor="email"
          className="font-Zilla-Slab flex w-full flex-col text-2xl font-semibold tracking-[1px]"
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
  return (
    <>
      <Form
        method="POST"
        className="flex w-full flex-col gap-4"
        id="signup-form"
      >
        <label
          htmlFor="email"
          className="font-Zilla-Slab flex w-full flex-col text-2xl font-semibold tracking-[1px]"
        >
          Email*
          <input
            type="text"
            name="email"
            id="email"
            className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
            required
          />
        </label>
        <label
          htmlFor="confirmEmail"
          className="font-Zilla-Slab flex w-full flex-col text-2xl font-semibold tracking-[1px]"
        >
          Confirm Email*
          <input
            type="text"
            name="confirmEmail"
            id="confirmEmail"
            className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
            required
          />
        </label>
        <div className="my-2"></div>
        <label
          htmlFor="password"
          className="font-Zilla-Slab flex w-full flex-col text-2xl font-semibold tracking-[1px]"
        >
          Password*
          <input
            type="password"
            name="password"
            id="password"
            className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
            required
          />
        </label>
        <label
          htmlFor="confirmPassword"
          className="font-Zilla-Slab flex w-full flex-col text-2xl font-semibold tracking-[1px]"
        >
          Confirm Password*
          <input
            type="password"
            name="confirmPassword"
            id="confirmPassword"
            className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
            required
          />
        </label>
      </Form>
    </>
  );
}

export default function SignUp() {
  const actionData = useActionData<typeof action>();

  const firstPage = FormFirstPage();
  const secondPage = FormSecondPage();
  const [formPage, setFormPage] = useState<ReactNode>(secondPage);
  const [isFirstPage, setIsFirstPage] = useState<boolean>(false);

  const paginationHandler = (page: ReactNode) => {
    setFormPage(page);
  };

  // useEffect(() => {
  //   setFormPage(firstPage);
  //   setIsFirstPage(true);
  // }, []);

  return (
    <main className="flex h-screen w-full flex-col items-center justify-center py-8 text-white">
      <div
        id="login-hero"
        className="flex aspect-square flex-col items-center justify-center gap-5 rounded-md bg-[#191716] px-28 py-8 shadow-sm"
      >
        <h1 className="font-Zilla-Slab mb-4 text-6xl font-bold text-brand-secondary">
          Create a New Account
        </h1>

        {actionData?.error && (
          <p style={{ color: "red" }}>{actionData.error}</p>
        )}

        {formPage}
        {isFirstPage ? (
          <Button
            className="font-Zilla-Slab min-h-[48px] rounded-md bg-brand-primary px-16 py-2 text-3xl font-bold tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:text-black"
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
              className="font-Zilla-Slab min-h-[48px] rounded-md bg-brand-primary px-8 py-2 text-3xl font-bold tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:text-black"
              type="submit"
              form="signup-form"
            >
              Sign-Up!
            </Button>
            <Button
              className="font-Zilla-Slab min-h-[48px] rounded-md bg-zinc-700 px-8 py-2 text-3xl font-bold tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:text-black"
              type="button"
              onClick={() => {
                paginationHandler(firstPage);
                setIsFirstPage(true);
              }}
            >
              Back
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
