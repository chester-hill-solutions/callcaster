import type { ReactNode } from "react";

import { Heading, Text } from "@/components/ui/typography";

type WorkspaceResourceListShellProps = {
  title: string;
  error?: string | null;
  isEmpty?: boolean;
  emptyMessage: string;
  addAction?: ReactNode;
  children?: ReactNode;
  tableClassName?: string;
};

export function WorkspaceResourceListShell({
  title,
  error,
  isEmpty = false,
  emptyMessage,
  addAction,
  children,
}: WorkspaceResourceListShellProps) {
  const showError = Boolean(error) && !isEmpty;

  return (
    <main className="flex h-full flex-col gap-4 rounded-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <Heading
          as="h1"
          level={2}
          branded
          className="mb-4 text-center sm:text-left"
        >
          {title}
        </Heading>
        {addAction}
      </div>

      {showError ? (
        <Text className="text-center text-4xl font-bold text-destructive">
          {error}
        </Text>
      ) : null}

      {isEmpty ? (
        <Heading
          as="p"
          level={3}
          branded
          className="py-16 text-center"
        >
          {emptyMessage}
        </Heading>
      ) : (
        children
      )}
    </main>
  );
}
