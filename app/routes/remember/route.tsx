import { Form, Link } from "@remix-run/react";
import { Button } from "~/components/ui/button";

export default function Remember() {
  return (
    <main className="flex h-screen w-full flex-col items-center justify-center py-8 text-white">
      <div
        id="login-hero"
        className="flex aspect-square flex-col items-center justify-center gap-5 rounded-md bg-[#191716] px-28 py-8 shadow-sm"
      >
        <h1 className="mb-4 font-Zilla-Slab text-6xl font-bold text-brand-secondary">
          Please Enter Your Email
        </h1>

        {/* {actionData?.error && (
            <p style={{ color: "red" }}>{actionData.error}</p>
          )} */}

        <Form
          method="POST"
          className="flex w-full flex-col gap-4"
          id="remember-form"
        >
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

          <Button
            className="min-h-[48px] rounded-md bg-brand-primary px-16 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
              transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:text-black"
            type="submit"
          >
            Send Password Reset
          </Button>
        </Form>
      </div>
    </main>
  );
}
