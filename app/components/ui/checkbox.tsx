import type { CheckboxProps as AriaCheckboxProps } from "react-aria-components";

import { Checkbox as ShadCheckbox } from "@chester-hill-solutions/shad-cc/checkbox";

type CheckboxProps = Omit<
  AriaCheckboxProps,
  "isSelected" | "defaultSelected" | "onChange" | "isDisabled" | "isIndeterminate"
> & {
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  isDisabled?: boolean;
  isSelected?: boolean;
  isIndeterminate?: boolean;
  onChange?: AriaCheckboxProps["onChange"];
};

function Checkbox({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  isDisabled,
  isSelected,
  isIndeterminate,
  onChange,
  ...props
}: CheckboxProps) {
  const indeterminate =
    isIndeterminate || checked === "indeterminate";
  const selected =
    isSelected ?? (checked === "indeterminate" ? false : checked);

  return (
    <ShadCheckbox
      isSelected={selected}
      isIndeterminate={indeterminate}
      defaultSelected={defaultChecked}
      isDisabled={isDisabled ?? disabled}
      onChange={(value) => {
        onChange?.(value);
        onCheckedChange?.(value);
      }}
      {...props}
    />
  );
}

export { Checkbox };
