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
  const phoneNumber = validationRequest?.phoneNumber?.trim() ?? "";
  const code = validationRequest?.validationCode?.trim() ?? "";

  return (
    <Dialog open={isOpen && Boolean(validationRequest)} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-full max-w-md flex-col items-center">
        <DialogHeader>
          <DialogTitle className="text-center">Your verification code</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            {phoneNumber
              ? `You will receive a call at ${phoneNumber}.`
              : "You will receive a call at the number you submitted."}
          </p>
          {code ? (
            <div className="rounded-md border bg-muted/30 px-6 py-4 font-mono text-4xl tracking-widest">
              {code}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Check the verification call for your code.
            </p>
          )}
          <p className="text-sm text-muted-foreground">Enter this code when prompted.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
