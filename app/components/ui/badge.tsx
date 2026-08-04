import { Badge, badgeVariants } from "@chester-hill-solutions/shad-cc/badge";
import type { ComponentProps } from "react";
import type { VariantProps } from "class-variance-authority";

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;
export { Badge, badgeVariants };
