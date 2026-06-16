import { Form, useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

type CallerIdVerificationFormProps = {
  formId?: string;
  actionName?: string;
  formName?: string;
  disabled?: boolean;
  submitLabel?: string;
  pendingLabel?: string;
  isPending?: boolean;
  fetcher?: ReturnType<typeof useFetcher<unknown>>;
};

export function CallerIdVerificationForm({
  formId = "caller-id-verification-form",
  actionName,
  formName = "caller-id",
  disabled = false,
  submitLabel = "Verify number",
  pendingLabel = "Starting verification…",
  isPending = false,
  fetcher,
}: CallerIdVerificationFormProps) {
  const FormComponent = fetcher?.Form ?? Form;

  return (
    <FormComponent id={formId} method="post" className="space-y-4">
      {actionName ? <input type="hidden" name="_action" value={actionName} /> : null}
      <input type="hidden" name="formName" value={formName} />
      <FormField
        label="Your phone number"
        htmlFor={`${formId}-phoneNumber`}
        description="The phone number you currently own."
      >
        <Input
          id={`${formId}-phoneNumber`}
          name="phoneNumber"
          type="tel"
          placeholder="+1 555 555 0100"
          required
          disabled={disabled || isPending}
        />
      </FormField>
      <FormField
        label="Caller ID name"
        htmlFor={`${formId}-friendlyName`}
        description="How you wish to be identified on caller ID."
      >
        <Input
          id={`${formId}-friendlyName`}
          name="friendlyName"
          placeholder="Your organization"
          required
          disabled={disabled || isPending}
        />
      </FormField>
      <p className="text-sm text-muted-foreground">
        After you submit, you will receive a call with a 6-digit verification code.
      </p>
      <Button type="submit" disabled={disabled || isPending} aria-busy={isPending}>
        {isPending ? pendingLabel : submitLabel}
      </Button>
    </FormComponent>
  );
}
