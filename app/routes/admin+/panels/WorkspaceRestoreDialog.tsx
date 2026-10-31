import { Form, useNavigation } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function WorkspaceRestoreDialog({ workspaceId, name }: { workspaceId: string; name: string }) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Restore ${name}`}>Restore</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore workspace</DialogTitle>
          <DialogDescription>
            Restore access to {name} for its members. Released phone numbers will not be rented again.
            Add new numbers after restore if they are needed. Old API keys will not work; create new keys after restore. A disabled workspace will stay disabled.
          </DialogDescription>
        </DialogHeader>
        <Form method="post">
          <input type="hidden" name="_action" value="restore_workspace" />
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="confirmRestore" value="yes" />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" type="button">Cancel</Button></DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Restoring…" : "Restore workspace"}</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
