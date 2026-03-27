import * as React from "react";

import { FormFieldContext } from "./FormFieldContext";

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
