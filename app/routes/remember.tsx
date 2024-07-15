import { ActionFunctionArgs, json } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { createSupabaseServerClient } from "~/lib/supabase.server";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient, headers } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const email = formData.get("email") as string;

  const { data: emailExists, error: errorGettingEmail } = await supabaseClient
    .from("user")
    .select()
    .eq("username", email)
    .single();

  if (emailExists) {
    // const sendGridRequest = new Request(
    //   "https://api.sendgrid.com/v3/mail/send",
    //   {
    //     method: "POST",
    //     body: JSON.stringify({
    //       personalizations: [{ to: [{ email: email }] }],
    //       from: { email: "info@callcaster.ca" },
    //       subject: "Testing Forgotten Password Confirmation",
    //       content: [
    //         {
    //           type: "text/plain",
    //           value: "This is a test email seeing if the SendGrid API works!",
    //         },
    //       ],
    //     }),
    //     headers: {
    //       Authorization: `Bearer ${SENDGRID_API_KEY}`,
    //       "Content-Type": "application/json",
    //     },
    //   },
    // );
    // const sendGridResponse = await fetch(sendGridRequest);

    const { data: emailResetData, error: emailResetError } =
      await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: "https://localhost:3000/reset-password",
      });
    console.log(emailResetError);
    return json(
      { message: `Reset request sent to ${email}`, error: null },
      { headers },
    );
  }

  return json(
    { message: null, error: "There is no account associated with this email" },
    { headers },
  );
}

export default function Remember() {
  const actionData = useActionData<typeof action>();

  return (
    <main className="flex h-[calc(100vh-80px)] w-full grow flex-col items-center py-8 text-white">
      <div
        id="login-hero"
        className="flex h-full flex-col items-center justify-center gap-4 rounded-md bg-brand-secondary px-20 pb-24 pt-16 shadow-lg dark:border-2 dark:border-white dark:bg-zinc-900 dark:bg-opacity-80 dark:shadow-none"
      >
        {/* {actionData?.error && (
            <p style={{ color: "red" }}>{actionData.error}</p>
          )} */}

        <h1 className="mb-auto font-Zilla-Slab text-6xl font-bold text-brand-primary dark:text-white">
          Send Password Reset
        </h1>

        {actionData && (
          <div className="font-Zilla-Slab text-2xl font-bold">
            {actionData.message ? (
              <span className="text-green-500">{actionData.message}</span>
            ) : (
              <span className="text-red-500">{actionData?.error}</span>
            )}
          </div>
        )}

        <Form
          id="forgot-password-form"
          method="POST"
          className="mb-auto flex w-full flex-col gap-4"
        >
          <label
            htmlFor="email"
            className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
          >
            Email
            <input
              type="text"
              name="email"
              id="email"
              className="w-full rounded-sm border-2 border-black bg-transparent px-4 py-2 text-black dark:border-white dark:text-white"
            />
          </label>
          <Button
            size={null}
            className="w-full rounded-md bg-brand-primary py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
            transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
            type="submit"
          >
            Reset
          </Button>
        </Form>
      </div>
    </main>
  );
}
