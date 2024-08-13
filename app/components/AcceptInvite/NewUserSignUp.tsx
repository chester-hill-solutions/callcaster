import { Form } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { NameFields } from "./NameFields";
import { EmailField } from "./EmailField";
import { PasswordFields } from "./PasswordFields";

interface NewUserSignupProps {
  email: string;
  state: string;
  token_hash: string | null;
  type: "signup" | "invite" | "magiclink" | "recovery" | "email_change" | null;
}

export function NewUserSignup({
  state,
  token_hash,
  type,
  email
}: NewUserSignupProps) {
  if (!token_hash || !type) {
    return <p>Invalid invitation link. Please check your email for a valid invite.</p>;
  }

  return (
    <Form method="POST" className="flex w-full flex-col gap-4" id="signup-form">
      <NameFields />
      <EmailField email={email} />
      <PasswordFields />
      <input type="hidden" name="actionType" value="signUpAndVerify" />
      <input type="hidden" name="token_hash" value={token_hash} />
      <input type="hidden" name="type" value={type} />
      <Button type="submit" disabled={state !== "idle"}>
        Sign Up and Accept Invite
      </Button>
    </Form>
  );
}