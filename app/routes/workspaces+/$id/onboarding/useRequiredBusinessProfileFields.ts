import { useState } from "react";
import {
  businessProfileFieldFormatMessage,
  businessProfileFieldRequiredMessage,
  type BusinessProfileFieldKey,
} from "@/lib/messaging-onboarding/predicates";

type InvalidReason = "missing" | "format";

/**
 * Shared client-side required-field UX for business profile wizard steps.
 * Marks fields invalid on native constraint failure and clears when edited.
 *
 * The invalid reason is read from `ValidityState` (#1122): `valueMissing`
 * reports the field's required message, any other constraint failure (e.g.
 * `typeMismatch` on `type="url"`) reports a format message — including on
 * optional fields, which otherwise surface only the native browser bubble
 * while claiming to be optional.
 */
export function useRequiredBusinessProfileFields() {
  const [invalidFields, setInvalidFields] = useState<
    Partial<Record<BusinessProfileFieldKey, InvalidReason>>
  >({});

  const markInvalid = (
    field: BusinessProfileFieldKey,
    reason: InvalidReason | null,
  ) => {
    setInvalidFields((current) => {
      if ((current[field] ?? null) === reason) return current;
      const next = { ...current };
      if (reason === null) {
        delete next[field];
      } else {
        next[field] = reason;
      }
      return next;
    });
  };

  const reasonFromValidity = (validity: ValidityState): InvalidReason =>
    validity.valueMissing ? "missing" : "format";

  const requiredFieldProps = <
    T extends HTMLInputElement | HTMLTextAreaElement,
  >(
    field: BusinessProfileFieldKey,
    options: { required?: boolean } = {},
  ) => {
    // Explicitly falsy → optional field: no `required`, but the invalid
    // handler stays attached so a malformed value (only the format branch can
    // fire without `required`) shows an in-page error instead of the native
    // bubble. Undefined defaults to `true` so existing callsites keep marking
    // their fields required.
    const required = options.required !== false;
    if (!required) {
      return {
        "aria-invalid": invalidFields[field] ? true : undefined,
        onInvalid: (event: React.FormEvent<T>) => {
          event.preventDefault();
          markInvalid(field, reasonFromValidity(event.currentTarget.validity));
        },
        onChange: (event: React.ChangeEvent<T>) => {
          // Any edit clears: an emptied optional field is valid again, and a
          // stale "missing" latched from a previous required pass (goal
          // switched away from SMS) must not lie in the error slot.
          void event;
          markInvalid(field, null);
        },
      } as const;
    }
    return {
      required: true as const,
      "aria-invalid": invalidFields[field] ? true : undefined,
      onInvalid: (event: React.FormEvent<T>) => {
        event.preventDefault();
        markInvalid(field, reasonFromValidity(event.currentTarget.validity));
      },
      onChange: (event: React.ChangeEvent<T>) => {
        if (event.target.value.trim()) {
          markInvalid(field, null);
        }
      },
    };
  };

  const requiredFieldError = (
    field: BusinessProfileFieldKey,
    options: { required?: boolean } = {},
  ) => {
    const reason = invalidFields[field];
    if (!reason) return undefined;
    if (reason === "format") return businessProfileFieldFormatMessage(field);
    // An optional field never renders the "required" error, even if the
    // missing flag is still latched from an earlier required render.
    if (options.required === false) return undefined;
    return businessProfileFieldRequiredMessage(field);
  };

  return { requiredFieldProps, requiredFieldError };
}
