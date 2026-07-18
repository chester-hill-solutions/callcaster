import * as React from "react";
import type { Key } from "react-aria-components";

import {
  Select as ShadSelect,
  SelectContent,
  SelectGroup,
  SelectItem as ShadSelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue as ShadSelectValue,
} from "@chester-hill-solutions/shad-cc/select";

type SelectProps<T extends string = string> = Omit<
  React.ComponentProps<typeof ShadSelect>,
  | "selectedKey"
  | "defaultSelectedKey"
  | "onSelectionChange"
  | "isDisabled"
  | "isRequired"
> & {
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  disabled?: boolean;
  isDisabled?: boolean;
  required?: boolean;
  isRequired?: boolean;
};

function Select<T extends string = string>({
  value,
  defaultValue,
  onValueChange,
  disabled,
  isDisabled,
  required,
  isRequired,
  ...props
}: SelectProps<T>) {
  return (
    <ShadSelect
      selectedKey={value}
      defaultSelectedKey={defaultValue}
      isDisabled={isDisabled ?? disabled}
      isRequired={isRequired ?? required}
      onSelectionChange={(key: Key | null) => {
        if (key == null) return;
        onValueChange?.(String(key) as T);
      }}
      {...props}
    />
  );
}

type SelectItemProps = Omit<
  React.ComponentProps<typeof ShadSelectItem>,
  "id" | "isDisabled"
> & {
  value: string;
  disabled?: boolean;
  isDisabled?: boolean;
};

function SelectItem({ value, disabled, isDisabled, ...props }: SelectItemProps) {
  return (
    <ShadSelectItem
      id={value}
      isDisabled={isDisabled ?? disabled}
      textValue={
        props.textValue ??
        (typeof props.children === "string" ? props.children : undefined)
      }
      {...props}
    />
  );
}

type SelectValueProps = React.ComponentProps<typeof ShadSelectValue> & {
  placeholder?: string;
};

function SelectValue({ placeholder, children, ...props }: SelectValueProps) {
  return (
    <ShadSelectValue {...props}>
      {children ??
        (({ isPlaceholder, defaultChildren }) =>
          isPlaceholder && placeholder ? placeholder : defaultChildren)}
    </ShadSelectValue>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
