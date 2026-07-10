import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/typography";
import { NavLink } from "react-router";

type NumberPurchaseSuccessDialogProps = {
  phoneNumber: string | null;
  onClose: () => void;
  workspaceId: string;
};

export function NumberPurchaseSuccessDialog({
  phoneNumber,
  onClose,
  workspaceId,
}: NumberPurchaseSuccessDialogProps) {
  return (
    <Dialog
      open={phoneNumber !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="bg-card sm:max-w-md">
        {phoneNumber ? (
          <>
            <DialogHeader>
              <DialogTitle>Your number is live 🎉</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Text variant="muted" className="text-sm">
                Try it now: call {phoneNumber} from your phone. You&apos;ll reach
                your workspace voicemail — the recording lands in your
                Voicemails tab and your email inbox.
              </Text>
              <a
                href={`tel:${phoneNumber}`}
                className="block select-all text-center text-2xl font-semibold tracking-wide text-foreground underline underline-offset-4"
              >
                {phoneNumber}
              </a>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" type="button" onClick={onClose}>
                Done
              </Button>
              <Button asChild>
                <NavLink to={`/workspaces/${workspaceId}/voicemails`} onClick={onClose}>
                  Go to Voicemails
                </NavLink>
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
