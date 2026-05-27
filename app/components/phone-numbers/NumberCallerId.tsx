import { CallerIdVerificationForm } from "./CallerIdVerificationForm";

export const NumberCallerId = () => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Verify your number</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Use a phone number you already own as an outbound caller ID.
        </p>
      </div>
      <CallerIdVerificationForm />
    </div>
  );
};
