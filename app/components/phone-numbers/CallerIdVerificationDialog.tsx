import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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
    <Sheet
      open={isOpen && Boolean(validationRequest)}
      onOpenChange={onOpenChange}
    >
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Your verification code</SheetTitle>
          <SheetDescription>
            Enter this code when prompted on the verification call.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4 text-center">
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
