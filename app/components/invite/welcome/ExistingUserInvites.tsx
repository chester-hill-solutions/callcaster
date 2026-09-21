import { Form } from "react-router";
import { Button } from "@/components/ui/button";

type PendingInvite = {
  created_at: string;
  email: string;
  id: string;
  role: string;
  status: string;
  expires_at: string | null;
  workspace: { name: string; id: string };
};

interface ExistingUserInvitesProps {
  invites: PendingInvite[];
  state: string;
}

/**
 * Email-first invitation list (#1713 / SEC-03). Acceptance happens through the
 * emailed link (which carries the one-time token), so the list is
 * informational — it can resend the link, never accept directly.
 */
export function ExistingUserInvites({ invites, state }: ExistingUserInvitesProps) {
  return (
    <div className="my-2 flex w-full flex-col gap-4">
      <h3 className="font-Zilla-Slab text-xl">Pending Invitations</h3>
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
        >
          <div>
            <p className="font-semibold">{invite.workspace.name}</p>
            <p className="text-sm text-muted-foreground">
              Invited as {invite.role}
            </p>
          </div>
          <Form method="POST">
            <input type="hidden" name="actionType" value="resendInvitation" />
            <input type="hidden" name="invitationId" value={invite.id} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={state !== "idle"}
            >
              Resend link
            </Button>
          </Form>
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        You'll accept by opening the link in your email.
      </p>
    </div>
  );
}