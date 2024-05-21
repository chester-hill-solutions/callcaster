import { Form, Link } from "@remix-run/react";
import { Button } from "~/components/ui/button";

export default function ResetPassword({ request }: { request: Request }) {
  return (
    <main className="flex h-screen w-full flex-col items-center justify-center py-8 text-white">
      <div
        id="login-hero"
        className="flex aspect-square flex-col items-center justify-center gap-5 rounded-md bg-[#191716] px-28 py-8 shadow-sm"
      >
        <h1 className="mb-4 font-Zilla-Slab text-6xl font-bold text-brand-secondary">
          Login
        </h1>

        {/* {actionData?.error && (
            <p style={{ color: "red" }}>{actionData.error}</p>
          )} */}

        <div className="flex w-full items-center justify-center gap-2">
          <div className="w-full border border-brand-secondary" />
          <p className="font-regular font-Zilla-Slab text-xl text-brand-secondary">
            OR
          </p>
          <div className="w-full border border-brand-secondary" />
        </div>

        <Form
          method="POST"
          className="flex w-full flex-col gap-4"
          id="signin-form"
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

          <label
            htmlFor="password"
            className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px]"
          >
            Password
            <input
              type="password"
              name="password"
              id="password"
              className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
            />
          </label>
        </Form>

        <Button
          className="min-h-[48px] rounded-md bg-brand-primary px-16 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
              transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:text-black"
          type="submit"
          form="signin-form"
        >
          Login
        </Button>
        <Link
          to={"/signup"}
          className="font-Zilla-Slab text-xl font-bold tracking-[1px] text-brand-secondary hover:underline"
        >
          Don't Have an Account Yet? Click{" "}
          <span className="text-brand-primary">HERE</span> to Sign-Up!
        </Link>
        <Link
          to={"/remember"}
          className="font-Zilla-Slab text-xl font-bold tracking-[1px] text-brand-tertiary hover:underline"
        >
          I forgot my password
        </Link>
      </div>
    </main>
  );
}
