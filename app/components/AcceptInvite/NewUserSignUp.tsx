import { Form } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { NameFields } from "./NameFields";
import { EmailField } from "./EmailField";
import { PasswordFields } from "./PasswordFields";

interface NewUserSignupProps {
  email: string;
  state: string;
}

export function NewUserSignup({
  state,
  email
}: NewUserSignupProps) {

  return (
    <Form method="POST" className="flex w-full flex-col gap-4" id="signup-form">
      <NameFields />
      <EmailField email={email} />
      <PasswordFields />
      <input type="hidden" name="actionType" value="updateUser" />
      <Button type="submit" disabled={state !== "idle"}>
        Sign Up and Accept Invite
      </Button>
    </Form>
  );
}