import * as React from 'react';
import { TagProps, TagListProps, GroupProps, InputProps, Popover, ListBoxSectionProps, ListBoxItemProps, HeaderProps, ListBoxProps, SeparatorProps, ButtonProps, ComboBoxValueProps } from 'react-aria-components';
export { ComboBox as Combobox, Collection as ComboboxCollection } from 'react-aria-components';

declare function ComboboxValue<T>({ ...props }: ComboBoxValueProps<T>): React.JSX.Element;
declare function ComboboxTrigger({ className, children, ...props }: Omit<ButtonProps, "children"> & {
    children?: React.ReactNode;
}): React.JSX.Element;
declare function ComboboxInput({ className, children, disabled, showTrigger, showClear, ...props }: React.ComponentProps<"input"> & {
    showTrigger?: boolean;
    showClear?: boolean;
}): React.JSX.Element;
declare function ComboboxContent({ className, placement, offset, crossOffset, anchor, ...props }: Omit<React.ComponentProps<typeof Popover>, "className" | "children"> & {
    className?: string;
    children?: React.ReactNode;
    anchor?: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element;
declare function ComboboxList<T extends object>({ className, ...props }: ListBoxProps<T>): React.JSX.Element;
declare function ComboboxItem<T extends object>({ className, children, ...props }: ListBoxItemProps<T>): React.JSX.Element;
declare function ComboboxGroup<T extends object>({ className, ...props }: ListBoxSectionProps<T>): React.JSX.Element;
declare function ComboboxLabel({ className, ...props }: HeaderProps): React.JSX.Element;
declare function ComboboxEmpty({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function ComboboxSeparator({ className, ...props }: SeparatorProps): React.JSX.Element;
declare function ComboboxChips({ children, className, ...props }: GroupProps): React.JSX.Element;
declare function ComboboxChipList<T extends object>({ className, ...props }: Omit<TagListProps<T>, "className" | "items"> & {
    className?: string;
}): React.JSX.Element;
declare function ComboboxChip({ className, children, showRemove, ...props }: Omit<TagProps, "children"> & {
    showRemove?: boolean;
    children?: React.ReactNode;
}): React.JSX.Element;
declare function ComboboxChipsInput({ className, ...props }: InputProps): React.JSX.Element;
declare function useComboboxAnchor(): React.RefObject<HTMLDivElement | null>;

export { ComboboxChip, ComboboxChipList, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxSeparator, ComboboxTrigger, ComboboxValue, useComboboxAnchor };
