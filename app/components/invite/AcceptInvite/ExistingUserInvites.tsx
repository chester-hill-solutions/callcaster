import { Form } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { InviteCheckbox } from "./InviteCheckbox";

type PendingInvite = {
  created_at: string;
  id: string;
  isNew: boolean;
  role: "admin" | "owner" | "caller" | "member";
  user_id: string;
  workspace: { name: string; id: string };
};

interface ExistingUserInvitesProps {
  invites: PendingInvite[];
  state: string;
}

export function ExistingUserInvites({ invites, state }: ExistingUserInvitesProps) {
  return (
    <Form method="POST" className="flex w-full flex-col gap-4 my-2" id="accept-invites-form">
        <h3 className="font-Zilla-Slab text-xl">Pending Invitations</h3>
      {invites.map((invite) => (
        <InviteCheckbox key={invite.id} invite={invite} />
      ))}
      <input hidden value={"acceptInvitations"} id="actionType" name="actionType"/>
      <Button type="submit" disabled={state !== "idle"} className="mt-4">
        Accept Invitations
      </Button>
    </Form>
  );
}

