import { useId } from "react";

import { FormField, FormFieldControl } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RowsPerPageSelectProps = {
  value: number;
  options: number[];
  onValueChange: (value: number) => void;
  className?: string;
};

export function RowsPerPageSelect({
  value,
  options,
  onValueChange,
  className = "w-25",
}: RowsPerPageSelectProps) {
  const id = useId();

  return (
    <FormField htmlFor={id} label="Rows per page" className="contents [&>label]:sr-only">
      <div className="contents">
        <Select value={String(value)} onValueChange={(size) => onValueChange(Number(size))}>
          <FormFieldControl>
            <SelectTrigger id={id} className={className} aria-label="Rows per page">
              <SelectValue placeholder="Rows per page" />
            </SelectTrigger>
          </FormFieldControl>
          <SelectContent>
            {options.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FormField>
  );
}
