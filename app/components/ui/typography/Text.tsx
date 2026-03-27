import * as React from "react";

import { cn } from "@/lib/utils";

import { textVariants, type TextVariantProps } from "./typography-styles";

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    TextVariantProps {
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
