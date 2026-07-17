import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminTableOverflowProps = {
    children: ReactNode;
    className?: string;
};

/** Horizontal scroll wrapper for wide admin tables on narrow viewports. */
export function AdminTableOverflow({ children, className }: AdminTableOverflowProps) {
    return (
        <div className={cn("w-full min-w-0 overflow-x-auto", className)}>
            {children}
        </div>
    );
}
