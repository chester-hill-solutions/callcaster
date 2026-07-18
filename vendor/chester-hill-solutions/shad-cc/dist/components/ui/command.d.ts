import * as React from 'react';
import { AutocompleteProps, MenuSectionProps, InputProps, MenuItemProps, MenuProps, SeparatorProps } from 'react-aria-components';
import { Dialog } from './dialog.js';
import './button.js';
import 'class-variance-authority/types';
import 'class-variance-authority';

declare function Command({ className, dir, style, ...props }: Omit<AutocompleteProps, "className" | "style"> & {
    className?: string;
    dir?: React.HTMLAttributes<HTMLDivElement>["dir"];
    style?: React.CSSProperties;
}): React.JSX.Element;
declare function CommandDialog({ title, description, children, open, onOpenChange, className, showCloseButton, ...props }: Omit<React.ComponentProps<typeof Dialog>, "children" | "className" | "isOpen" | "onOpenChange"> & {
    title?: string;
    description?: string;
    open?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
    className?: string;
    showCloseButton?: boolean;
    children: React.ReactNode;
}): React.JSX.Element;
declare function CommandInput({ className, ...props }: InputProps): React.JSX.Element;
declare function CommandList<T extends object>({ className, ...props }: MenuProps<T>): React.JSX.Element;
declare function CommandEmpty({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CommandGroup<T extends object>({ className, children, items, heading, ...props }: MenuSectionProps<T> & {
    heading?: string;
}): React.JSX.Element;
declare function CommandSeparator({ className, ...props }: SeparatorProps): React.JSX.Element;
declare function CommandItem<T extends object>({ className, children, textValue, ...props }: MenuItemProps<T>): React.JSX.Element;
declare function CommandShortcut({ className, ...props }: React.ComponentProps<"span">): React.JSX.Element;

export { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut };
