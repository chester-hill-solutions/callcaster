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
    options: { required?: boolean } = {},
  ) => {
    // Explicitly falsy → optional field: no `required`, no invalid handler, no
    // aria-invalid, no cached "missing" state to leak into the error slot.
    // Undefined defaults to `true` so existing callsites keep marking their
    // fields required.
    const required = options.required !== false;
    if (!required) {
      return {
        onChange: (event: React.ChangeEvent<T>) => {
          // Field went from required → optional (goal switched away from SMS)
          // with a stale error still latched from the previous required pass;
          // clear it whenever the user edits so the error slot doesn't lie.
          if (event.target.value.trim()) markMissing(field, false);
        },
      } as const;
    }
    return {
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
    };
  };

  const requiredFieldError = (
    field: BusinessProfileFieldKey,
    options: { required?: boolean } = {},
  ) => {
    // An optional field never renders the "required" error, even if the
    // missingFields flag is still latched from an earlier required render.
    if (options.required === false) return undefined;
    return missingFields[field]
      ? businessProfileFieldRequiredMessage(field)
      : undefined;
  };

  return { requiredFieldProps, requiredFieldError };
}
