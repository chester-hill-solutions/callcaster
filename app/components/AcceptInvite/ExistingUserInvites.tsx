import { Form } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { InviteCheckbox } from "./InviteCheckbox";

interface ExistingUserInvitesProps {
  invites: any[];
  state: string;
}

export function ExistingUserInvites({ invites, state }: ExistingUserInvitesProps) {
  return (
    <Form method="POST" className="flex w-full flex-col gap-4 my-2" id="accept-invites-form">
        <h3 className="font-Zilla-Slab text-xl">Pending Invitations</h3>
      {invites.map((invite) => (
        <InviteCheckbox key={invite.id} invite={invite} />
      ))}
      <Button type="submit" disabled={state !== "idle"} className="mt-4">
        Accept Invitations
      </Button>
    </Form>
  );
}

