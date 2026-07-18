import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AdminDefinitionItem = {
    term: string;
    value: ReactNode;
    detail?: ReactNode;
};

type AdminDefinitionGridProps = {
    items: AdminDefinitionItem[];
    columns?: 2 | 3 | 4;
    className?: string;
};

const columnClass: Record<NonNullable<AdminDefinitionGridProps["columns"]>, string> = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
};

/** Flat definition grid for admin metric readouts (replaces nested bordered boxes). */
export function AdminDefinitionGrid({ items, columns = 4, className }: AdminDefinitionGridProps) {
    return (
        <dl
            className={cn(
                "grid gap-4 rounded-lg border bg-muted/30 p-4",
                columnClass[columns],
                className,
            )}
        >
            {items.map((item) => (
                <div key={item.term} className="min-w-0">
                    <dt className="text-sm text-muted-foreground">{item.term}</dt>
                    <dd className="mt-1 text-lg font-semibold text-foreground">{item.value}</dd>
                    {item.detail ? (
                        <dd className="mt-1 text-xs text-muted-foreground">{item.detail}</dd>
                    ) : null}
                </div>
            ))}
        </dl>
    );
}
