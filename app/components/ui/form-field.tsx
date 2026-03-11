import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type FormFieldContextValue = {
  descriptionId?: string;
  errorId?: string;
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

export interface FormFieldControlProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export function FormFieldControl({
  children,
  className,
  ...props
}: FormFieldControlProps) {
  const { descriptionId, errorId } = React.useContext(FormFieldContext);
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className} aria-describedby={describedBy} {...props}>
      {children}
    </div>
  );
}
