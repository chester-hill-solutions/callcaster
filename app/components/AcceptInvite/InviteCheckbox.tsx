import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
interface InviteCheckboxProps {
  invite: {
    created_at: string;
    id: string;
    isNew: boolean;
    role: "admin" | "owner" | "caller" | "member";
    user_id: string;
    workspace: { name: string; id: string };
  };
}

export function InviteCheckbox({ invite }: InviteCheckboxProps) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={`invite-${invite.id}`}
        name="invitation_id"
        value={invite.id}
      />
      <Label htmlFor={`invite-${invite.id}`}>
        Invitation to {invite.workspace.name}
      </Label>
    </div>
  );
}
