import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type FormFieldContextValue = {
  descriptionId?: string;
  errorId?: string;
  invalid?: boolean;
};

const FormFieldContext = React.createContext<FormFieldContextValue>({});

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
}

export function FormField({
  children,
  className,
  description,
  error,
  htmlFor,
  label,
  required,
  ...props
}: FormFieldProps) {
  const id = React.useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <FormFieldContext.Provider
      value={{ descriptionId, errorId, invalid: Boolean(error) }}
    >
      <div className={cn("space-y-2", className)} {...props}>
        {label ? (
          <Label htmlFor={htmlFor} className="text-sm font-semibold">
            {label}
            {required ? <span className="ml-1 text-destructive">*</span> : null}
          </Label>
        ) : null}
        {children}
        {description ? (
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
}

export interface FormFieldControlProps {
  /** The single form control to describe — an input, select, or textarea. */
  children: React.ReactNode;
}

/**
 * Wraps the field's control and forwards `aria-describedby` / `aria-invalid`
 * onto it. This merges onto the control itself rather than a wrapper element:
 * both attributes are only meaningful on the focusable control, so a wrapping
 * <div> would announce nothing.
 */
export function FormFieldControl({ children }: FormFieldControlProps) {
  const { descriptionId, errorId, invalid } = React.useContext(FormFieldContext);
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <Slot aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      {children}
    </Slot>
  );
}
