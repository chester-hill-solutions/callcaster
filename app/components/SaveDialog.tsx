import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

export const SaveDialog = ({
  isOpen,
  onClose,
  onSave,
  onSaveAsCopy,
  scriptName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onSaveAsCopy: () => void;
  scriptName: string;
}) => (
  <Dialog open={isOpen} onOpenChange={onClose}>
    <DialogContent className="bg-white dark:bg-slate-900">
      <DialogHeader>
        <DialogTitle>Save {scriptName}</DialogTitle>
        <DialogDescription>
          Would you like to save changes to the existing {scriptName}, or save
          as a copy?
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={onSave} className="mr-2" variant={"outline"}>
          Save
        </Button>
        <Button onClick={onSaveAsCopy}>Save as Copy</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
