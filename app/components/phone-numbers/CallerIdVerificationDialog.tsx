import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type CallerIdValidationRequest = {
  accountSid: string;
  callSid: string;
  friendlyName: string;
  phoneNumber: string;
  validationCode: string;
};

export type CallerIdVerificationStatus = "pending" | "success" | "failed";

export function CallerIdVerificationDialog({
  isOpen,
  onOpenChange,
  validationRequest,
  status,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  validationRequest: CallerIdValidationRequest | null | undefined;
  /** Live verification_status of the number being verified, when known. */
  status?: CallerIdVerificationStatus | null;
}) {
  const phoneNumber = validationRequest?.phoneNumber?.trim() ?? "";
  const code = validationRequest?.validationCode?.trim() ?? "";
  const liveStatus = status ?? "pending";

  const resolved = liveStatus === "success";
  const failed = liveStatus === "failed";

  return (
    <Sheet
      open={isOpen && Boolean(validationRequest)}
      onOpenChange={onOpenChange}
    >
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {resolved
              ? "Number verified"
              : failed
                ? "Verification failed"
                : "Verification pending"}
          </SheetTitle>
          <SheetDescription>
            {resolved
              ? "Your number is verified and ready to use as a caller ID."
              : failed
                ? "The verification call did not complete. Try verifying again."
                : "We're calling your number to confirm it — keep this code handy."}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4 text-center">
          {/* Pending: the confirmation token + call status */}
          {!resolved && !failed ? (
            <>
              <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
                Pending confirmation
              </div>
              <p className="text-sm text-muted-foreground">
                {phoneNumber
                  ? `You will receive a verification call at ${phoneNumber}.`
                  : "You will receive a verification call at the number you submitted."}
              </p>
              <div className="rounded-md border bg-muted/30 px-6 py-4">
                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Confirmation token
                </p>
                {code ? (
                  <p className="font-mono text-4xl tracking-widest">{code}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Check the verification call for your code.
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the confirmation token when the call prompts you. This
                sheet updates automatically once the number is verified.
              </p>
            </>
          ) : null}

          {/* Success / failure outcome */}
          {resolved || failed ? (
            <div
              className={cn(
                "rounded-md border px-6 py-4 text-lg font-semibold",
                resolved
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {resolved ? "✓ Verified" : "✕ Not verified"}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}