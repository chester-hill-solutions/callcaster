import type { SwitchProps as AriaSwitchProps } from "react-aria-components";

import { Switch as ShadSwitch } from "@chester-hill-solutions/shad-cc/switch";

type SwitchProps = Omit<
  AriaSwitchProps,
  "isSelected" | "defaultSelected" | "onChange" | "isDisabled"
> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  isDisabled?: boolean;
  isSelected?: boolean;
  onChange?: AriaSwitchProps["onChange"];
  size?: "sm" | "default";
};

function Switch({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  isDisabled,
  isSelected,
  onChange,
  ...props
}: SwitchProps) {
  return (
    <ShadSwitch
      isSelected={isSelected ?? checked}
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

export { Switch };
