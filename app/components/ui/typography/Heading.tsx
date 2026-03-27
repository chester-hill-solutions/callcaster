import * as React from "react";

import { cn } from "@/lib/utils";

import {
  headingTagByLevel,
  headingVariants,
  type HeadingLevel,
  type HeadingTag,
  type HeadingVariantProps,
} from "./typography-styles";

export interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    HeadingVariantProps {
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
