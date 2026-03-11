import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const headingVariants = cva("text-foreground", {
  variants: {
    level: {
      1: "text-4xl font-bold tracking-tight sm:text-5xl",
      2: "text-3xl font-bold tracking-tight sm:text-4xl",
      3: "text-2xl font-semibold tracking-tight sm:text-3xl",
      4: "text-xl font-semibold tracking-tight sm:text-2xl",
    },
    branded: {
      true: "font-Zilla-Slab text-brand-primary dark:text-white",
      false: "font-semibold",
    },
  },
  defaultVariants: {
    level: 2,
    branded: false,
  },
});

const textVariants = cva("text-sm leading-6", {
  variants: {
    variant: {
      body: "text-foreground",
      muted: "text-muted-foreground",
      lead: "text-base text-muted-foreground sm:text-lg",
      small: "text-sm text-muted-foreground",
      caption: "text-xs uppercase tracking-wide text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

type HeadingLevel = 1 | 2 | 3 | 4;
type HeadingTag = keyof Pick<
  React.JSX.IntrinsicElements,
  "h1" | "h2" | "h3" | "h4" | "div" | "p"
>;

const headingTagByLevel: Record<HeadingLevel, HeadingTag> = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
};

export interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  as?: HeadingTag;
  level?: HeadingLevel;
}

export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ as, className, level = 2, branded, ...props }, ref) => {
    const Comp = as ?? headingTagByLevel[level];

    return (
      <Comp
        ref={ref}
        className={cn(headingVariants({ level, branded, className }))}
        {...props}
      />
    );
  },
);
Heading.displayName = "Heading";

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  as?: "p" | "span" | "div";
}

export function Text({
  as: Comp = "p",
  className,
  variant,
  ...props
}: TextProps) {
  return <Comp className={cn(textVariants({ variant, className }))} {...props} />;
}
