import type { ComponentProps } from "react";
import type { VariantProps } from "class-variance-authority";

import {
  Badge,
  badgeVariants,
} from "@chester-hill-solutions/shad-cc/badge";

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

export { Badge, badgeVariants };
