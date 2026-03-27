import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { FormFieldContext } from "./FormFieldContext";

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
    <FormFieldContext.Provider value={{ descriptionId, errorId }}>
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
