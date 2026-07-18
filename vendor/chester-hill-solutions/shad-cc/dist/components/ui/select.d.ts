import * as React from 'react';
import { SelectProps, Popover, ListBoxSectionProps, SearchFieldProps, ListBoxItem, Header, ListBoxProps, Separator, Button, SelectValueProps } from 'react-aria-components';

declare function Select<T extends object, M extends "single" | "multiple" = "single">({ className, ...props }: SelectProps<T, M>): React.JSX.Element;
declare function SelectGroup<T extends object>({ className, ...props }: ListBoxSectionProps<T>): React.JSX.Element;
declare function SelectValue<T extends object>({ className, children, ...props }: SelectValueProps<T>): React.JSX.Element;
declare function SelectTrigger({ className, size, children, ...props }: Omit<React.ComponentProps<typeof Button>, "children"> & {
    children?: React.ReactNode;
    size?: "sm" | "default";
}): React.JSX.Element;
declare function SelectContent({ className, children, placement, offset, crossOffset, ...props }: Omit<React.ComponentProps<typeof Popover>, "className" | "children"> & {
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element;
declare function SelectPopover({ className, children, placement, offset, crossOffset, ...props }: Omit<React.ComponentProps<typeof Popover>, "className" | "children"> & {
    className?: string;
    children?: React.ReactNode;
}): React.JSX.Element;
declare function SelectList<T extends object>({ className, ...props }: ListBoxProps<T>): React.JSX.Element;
declare function SelectInput({ className, ...props }: SearchFieldProps): React.JSX.Element;
declare function SelectLabel({ className, ...props }: React.ComponentProps<typeof Header>): React.JSX.Element;
declare function SelectItem({ className, children, ...props }: React.ComponentProps<typeof ListBoxItem>): React.JSX.Element;
declare function SelectSeparator({ className, ...props }: React.ComponentProps<typeof Separator>): React.JSX.Element;
declare function SelectEmpty({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;

export { Select, SelectContent, SelectEmpty, SelectGroup, SelectInput, SelectItem, SelectLabel, SelectList, SelectPopover, SelectSeparator, SelectTrigger, SelectValue };
