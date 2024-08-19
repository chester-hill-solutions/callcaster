import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";

interface InviteCheckboxProps {
  invite: any;
}

export function InviteCheckbox({ invite }: InviteCheckboxProps) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox id={`invite-${invite.id}`} name="invitation_id" value={invite.id} />
      <Label htmlFor={`invite-${invite.id}`}>
        Invitation from {new Date(invite.created_at).toLocaleDateString()}
      </Label>
    </div>
  );
}
