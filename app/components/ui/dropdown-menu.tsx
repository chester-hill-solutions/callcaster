import * as React from "react";
import { useNavigate } from "react-router";

import {
  DropdownMenu as ShadDropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem as ShadDropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger as ShadDropdownMenuTrigger,
} from "@chester-hill-solutions/shad-cc/dropdown-menu";

type DropdownMenuRootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

/**
 * Radix-shaped DropdownMenu root → React Aria MenuTrigger.
 * Children: trigger, then DropdownMenuContent.
 */
function DropdownMenu({
  open,
  defaultOpen,
  onOpenChange,
  children,
}: DropdownMenuRootProps) {
  return (
    <ShadDropdownMenuTrigger
      isOpen={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {children}
    </ShadDropdownMenuTrigger>
  );
}

type DropdownMenuTriggerProps = {
  asChild?: boolean;
  children?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

function DropdownMenuTrigger({
  asChild,
  children,
  ...props
}: DropdownMenuTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    return children;
  }
  return (
    <button type="button" {...props}>
      {children}
    </button>
  );
}

function DropdownMenuContent({
  align,
  side,
  placement: placementProp,
  ...props
}: React.ComponentProps<typeof ShadDropdownMenuContent> & {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}) {
  const placement =
    placementProp ??
    (side === "left" || side === "right"
      ? side
      : align === "start" || align === "end"
        ? ((side ?? "bottom") === "top"
            ? (`top ${align}` as const)
            : (`bottom ${align}` as const))
        : side ?? "bottom");

  return (
    <ShadDropdownMenuContent
      placement={placement as React.ComponentProps<
        typeof ShadDropdownMenuContent
      >["placement"]}
      {...props}
    />
  );
}

type DropdownMenuItemProps = Omit<
  React.ComponentProps<typeof ShadDropdownMenuItem>,
  "onAction" | "isDisabled"
> & {
  asChild?: boolean;
  onSelect?: (event: Event) => void;
  onAction?: () => void;
  disabled?: boolean;
  isDisabled?: boolean;
};

function DropdownMenuItem({
  asChild,
  children,
  onSelect,
  onAction,
  disabled,
  isDisabled,
  ...props
}: DropdownMenuItemProps) {
  const navigate = useNavigate();
  const resolvedDisabled = isDisabled ?? disabled;

  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as {
      to?: string | { pathname?: string };
      href?: string;
      children?: React.ReactNode;
      onClick?: (event: React.MouseEvent) => void;
    };
    const to =
      typeof childProps.to === "string"
        ? childProps.to
        : childProps.to?.pathname;
    const href = childProps.href ?? to;

    return (
      <ShadDropdownMenuItem
        {...props}
        href={href}
        isDisabled={resolvedDisabled}
        onAction={() => {
          onAction?.();
          onSelect?.(new Event("select"));
          if (to) {
            navigate(to);
          }
        }}
      >
        {childProps.children}
      </ShadDropdownMenuItem>
    );
  }

  return (
    <ShadDropdownMenuItem
      {...props}
      isDisabled={resolvedDisabled}
      onAction={() => {
        onAction?.();
        onSelect?.(new Event("select"));
      }}
    >
      {children}
    </ShadDropdownMenuItem>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
