import * as React from "react";

export type FormFieldContextValue = {
  descriptionId?: string;
  errorId?: string;
};

export const FormFieldContext = React.createContext<FormFieldContextValue>({});
