import { type VariantProps } from "class-variance-authority";
import { type ToggleButtonProps } from "react-aria-components";
declare const toggleVariants: (props?: ({
    variant?: "default" | "outline" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function Toggle({ className, variant, size, ...props }: ToggleButtonProps & VariantProps<typeof toggleVariants>): import("react").JSX.Element;
export { Toggle, toggleVariants };
