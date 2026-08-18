import type { ReactNode } from "react";

import { Inbox } from "lucide-react";

import { Heading, Text } from "@/components/ui/typography";
import { Alert, AlertDescription } from "@/components/ui/alert";

type WorkspaceResourceEmptyStateProps = {
  emptyMessage: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  addAction?: ReactNode;
};

/**
 * Flat in-panel empty state. No Card chrome — the workspace panel already
 * owns the surface. Consumers outside this shell can reuse the fragment.
 */
export function WorkspaceResourceEmptyState({
  emptyMessage,
  emptyDescription,
  emptyIcon,
  addAction,
}: WorkspaceResourceEmptyStateProps) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center"
      data-testid="workspace-resource-empty-state"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-tertiary/40 text-brand-primary dark:bg-brand-primary/15">
        {emptyIcon ?? <Inbox className="h-7 w-7" aria-hidden="true" />}
      </div>
      <Heading as="h2" level={3} branded={false}>
        {emptyMessage}
      </Heading>
      {emptyDescription ? (
        <Text variant="muted" className="max-w-sm">
          {emptyDescription}
        </Text>
      ) : null}
      {addAction ? <div className="flex justify-center pt-2">{addAction}</div> : null}
    </div>
  );
}

type WorkspaceResourceListShellProps = {
  title: string;
  error?: string | null;
  isEmpty?: boolean;
  emptyMessage: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  addAction?: ReactNode;
  hideTitle?: boolean;
  children?: ReactNode;
};

export function WorkspaceResourceListShell({
  title,
  error,
  isEmpty = false,
  emptyMessage,
  emptyDescription,
  emptyIcon,
  addAction,
  hideTitle = false,
  children,
}: WorkspaceResourceListShellProps) {
  const showError = Boolean(error) && !isEmpty;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {hideTitle ? null : (
          <Heading
            as="h1"
            level={2}
            branded={false}
            className="text-center sm:text-left"
          >
            {title}
          </Heading>
        )}
        {!isEmpty ? addAction : null}
      </div>

      {showError ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isEmpty ? (
        <WorkspaceResourceEmptyState
          emptyMessage={emptyMessage}
          emptyDescription={emptyDescription}
          emptyIcon={emptyIcon}
          addAction={addAction}
        />
      ) : (
        children
      )}
    </div>
  );
}
