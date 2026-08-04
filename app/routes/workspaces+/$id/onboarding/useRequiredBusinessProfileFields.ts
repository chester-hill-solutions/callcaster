import { useState } from "react";
import {
  businessProfileFieldRequiredMessage,
  type BusinessProfileFieldKey,
} from "@/lib/messaging-onboarding/predicates";

/**
 * Shared client-side required-field UX for business profile wizard steps.
 * Marks fields invalid on native constraint failure and clears when filled.
 */
export function useRequiredBusinessProfileFields() {
  const [missingFields, setMissingFields] = useState<
    Partial<Record<BusinessProfileFieldKey, boolean>>
  >({});

  const markMissing = (field: BusinessProfileFieldKey, missing: boolean) => {
    setMissingFields((current) =>
      current[field] === missing ? current : { ...current, [field]: missing },
    );
  };

  const requiredFieldProps = <
    T extends HTMLInputElement | HTMLTextAreaElement,
  >(
    field: BusinessProfileFieldKey,
  ) => ({
    required: true as const,
    "aria-invalid": missingFields[field] || undefined,
    onInvalid: (event: React.FormEvent<T>) => {
      event.preventDefault();
      markMissing(field, true);
    },
    onChange: (event: React.ChangeEvent<T>) => {
      if (event.target.value.trim()) {
        markMissing(field, false);
      }
    },
  });

  const requiredFieldError = (field: BusinessProfileFieldKey) =>
    missingFields[field] ? businessProfileFieldRequiredMessage(field) : undefined;

  return { requiredFieldProps, requiredFieldError };
}
