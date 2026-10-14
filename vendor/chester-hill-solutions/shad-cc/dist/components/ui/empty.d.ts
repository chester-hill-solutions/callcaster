import { type VariantProps } from "class-variance-authority";
declare function Empty({ className, ...props }: React.ComponentProps<"div">): import("react").JSX.Element;
declare function EmptyHeader({ className, ...props }: React.ComponentProps<"div">): import("react").JSX.Element;
declare const emptyMediaVariants: (props?: ({
    variant?: "default" | "icon" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function EmptyMedia({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>): import("react").JSX.Element;
declare function EmptyTitle({ className, ...props }: React.ComponentProps<"div">): import("react").JSX.Element;
declare function EmptyDescription({ className, ...props }: React.ComponentProps<"p">): import("react").JSX.Element;
declare function EmptyContent({ className, ...props }: React.ComponentProps<"div">): import("react").JSX.Element;
export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia, };
