import { Form } from "react-router";
import { Button } from "@/components/ui/button";
import { NameFields } from "./NameFields";
import { EmailField } from "./EmailField";
import { PasswordFields } from "./PasswordFields";

interface NewUserSignupProps {
  email: string;
  state: string;
  invitationId?: string;
  token?: string;
}

export function NewUserSignup({
  state,
  email,
  invitationId,
  token,
}: NewUserSignupProps) {

  return (
    <Form method="POST" className="flex w-full flex-col gap-4" id="signup-form">
      <NameFields />
      <EmailField email={email} />
      <PasswordFields />
      <input type="hidden" name="actionType" value="updateUser" />
      {invitationId ? (
        <input type="hidden" name="invitationId" value={invitationId} />
      ) : null}
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <Button type="submit" disabled={state !== "idle"}>
        Sign Up and Accept Invite
      </Button>
    </Form>
  );
}