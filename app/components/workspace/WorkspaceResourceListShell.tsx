import type { ReactNode } from "react";

import { Heading, Text } from "@/components/ui/typography";

type WorkspaceResourceListShellProps = {
  title: string;
  error?: string | null;
  isEmpty?: boolean;
  emptyMessage: string;
  addAction?: ReactNode;
  children?: ReactNode;
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
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Heading
          as="h1"
          level={2}
          branded={false}
          className="text-center sm:text-left"
        >
          {title}
        </Heading>
        {addAction}
      </div>

      {showError ? (
        <Heading
          as="p"
          level={4}
          branded={false}
          className="text-center text-destructive"
        >
          {error}
        </Heading>
      ) : null}

      {isEmpty ? (
        addAction ? (
          <Text variant="muted" className="py-16 text-center">
            {emptyMessage}
          </Text>
        ) : (
          <Heading
            as="p"
            level={3}
            branded={false}
            className="py-16 text-center"
          >
            {emptyMessage}
          </Heading>
        )
      ) : (
        children
      )}
    </div>
  );
}
