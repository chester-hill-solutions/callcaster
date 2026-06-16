import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CallerIdValidationRequest = {
  accountSid: string;
  callSid: string;
  friendlyName: string;
  phoneNumber: string;
  validationCode: string;
};

export function CallerIdVerificationDialog({
  isOpen,
  onOpenChange,
  validationRequest,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  validationRequest: CallerIdValidationRequest | null | undefined;
}) {
  if (!validationRequest) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-full max-w-md flex-col items-center">
        <DialogHeader>
          <DialogTitle className="text-center">Your verification code</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            You will receive a call at {validationRequest.phoneNumber}.
          </p>
          <div className="rounded-md border bg-muted/30 px-6 py-4 font-mono text-4xl tracking-widest">
            {validationRequest.validationCode}
          </div>
          <p className="text-sm text-muted-foreground">Enter this code when prompted.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
