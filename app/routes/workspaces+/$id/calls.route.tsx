export { loader } from "./calls.loader.server";

import { Link, useLoaderData } from "react-router";

import { CallLogTable } from "@/components/calls/CallLogTable";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/typography";
import type { CallLogLoaderData } from "./calls.loader.server";

export default function WorkspaceCallLogPage() {
  const {
    rows,
    filters,
    workspaceNumbers,
    agents,
    pagination,
    workspace,
    error,
  } = useLoaderData<CallLogLoaderData>();

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <Heading as="h1" level={2} branded={false}>
          Calls
        </Heading>
        <Button asChild variant="outline" className="font-Zilla-Slab text-base font-semibold">
          <Link to=".." relative="path">
            Back
          </Link>
        </Button>
      </div>

      {error ? (
        <p className="text-center text-lg font-semibold text-destructive">
          {error}
        </p>
      ) : (
        <CallLogTable
          rows={rows}
          workspaceId={workspace?.id ?? ""}
          workspaceNumbers={workspaceNumbers}
          agents={agents}
          sorting={{
            sortKey: filters.sortKey,
            sortDirection: filters.sortDirection,
          }}
          filters={{
            callcasterNumber: filters.callcasterNumber,
            otherNumber: filters.otherNumber,
            direction: filters.direction,
            disposition: filters.disposition,
            agentUserId: filters.agentUserId,
          }}
          pagination={pagination}
        />
      )}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
