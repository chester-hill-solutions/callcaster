import * as React from "react";
import { Button as ButtonPrimitive, Header as HeaderPrimitive, ListBoxItem as ListBoxItemPrimitive, Popover as PopoverPrimitive, Separator as SeparatorPrimitive, type ListBoxProps, type SearchFieldProps, type ListBoxSectionProps as SelectGroupProps, type SelectProps, type SelectValueProps } from "react-aria-components";
declare function Select<T extends object, M extends "single" | "multiple" = "single">({ className, ...props }: SelectProps<T, M>): React.JSX.Element;
declare function SelectGroup<T extends object>({ className, ...props }: SelectGroupProps<T>): React.JSX.Element;
declare function SelectValue<T extends object>({ className, children, ...props }: SelectValueProps<T>): React.JSX.Element;
declare function SelectTrigger({ className, size, children, ...props }: Omit<React.ComponentProps<typeof ButtonPrimitive>, "children"> & {
    children?: React.ReactNode;
    size?: "sm" | "default";
}): React.JSX.Element;
declare function SelectContent({ className, children, placement, offset, crossOffset, ...props }: Omit<React.ComponentProps<typeof PopoverPrimitive>, "className" | "children"> & {
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element;
declare function SelectPopover({ className, children, placement, offset, crossOffset, ...props }: Omit<React.ComponentProps<typeof PopoverPrimitive>, "className" | "children"> & {
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element;
declare function SelectList<T extends object>({ className, ...props }: ListBoxProps<T>): React.JSX.Element;
declare function SelectInput({ className, ...props }: SearchFieldProps): React.JSX.Element;
declare function SelectLabel({ className, ...props }: React.ComponentProps<typeof HeaderPrimitive>): React.JSX.Element;
declare function SelectItem({ className, children, ...props }: React.ComponentProps<typeof ListBoxItemPrimitive>): React.JSX.Element;
declare function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SeparatorPrimitive>): React.JSX.Element;
declare function SelectEmpty({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
export { Select, SelectContent, SelectGroup, SelectInput, SelectItem, SelectLabel, SelectList, SelectPopover, SelectSeparator, SelectTrigger, SelectValue, SelectEmpty, };
