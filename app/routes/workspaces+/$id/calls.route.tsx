export { loader } from "./calls.loader.server";
export { action } from "./calls.action.server";

import { Link, useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

import { CallLogTable } from "@/components/calls/CallLogTable";
import { IncomingCallReceiver } from "@/components/calls/IncomingCallReceiver";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { workspacePanelHeightLgClass } from "@/components/workspace/workspace-panel-classes";
import { Button } from "@/components/ui/button";
import { MemberRole } from "@/components/workspace/TeamMember";
import type { CallLogActionData } from "./calls.action.server";
import type { CallLogLoaderData } from "./calls.loader.server";

export default function WorkspaceCallLogPage() {
  const {
    rows,
    filters,
    workspaceNumbers,
    agents,
    pagination,
    workspace,
    userRole,
    campaigns,
    error,
    handsetNumber,
    listening,
  } = useLoaderData<CallLogLoaderData>();
  const pickupFetcher = useFetcher<CallLogActionData>();
  const [isListening, setIsListening] = useState(listening.active);
  const [listenToken, setListenToken] = useState<string | null>(listening.token);
  const [listenTokenError, setListenTokenError] = useState<string | null>(
    listening.tokenError,
  );

  useEffect(() => {
    setIsListening(listening.active);
    setListenToken(listening.token);
    setListenTokenError(listening.tokenError);
  }, [listening.active, listening.token, listening.tokenError]);

  useActionFeedback(pickupFetcher.data, {
    getError: (data) =>
      data?.error ??
      (data?.listening === true && data?.tokenError ? data.tokenError : undefined),
    onSuccess: (data) => {
      if (data.listening === true) {
        setIsListening(true);
        setListenToken(data.token ?? null);
        setListenTokenError(data.tokenError ?? null);
        return;
      }
      if (data.listening === false) {
        setIsListening(false);
        setListenToken(null);
        setListenTokenError(null);
      }
    },
    getSuccess: (data) =>
      data?.listening === true || data?.listening === false,
    successMessage: (data) => {
      if (data.listening === true && !data.tokenError) {
        return "Listening for incoming calls";
      }
      if (data.listening === false) {
        return "Stopped listening for incoming calls";
      }
      return "";
    },
  });

  const startListening = () => {
    pickupFetcher.submit({ intent: "start_listening" }, { method: "POST" });
  };

  const stopListening = () => {
    pickupFetcher.submit({ intent: "stop_listening" }, { method: "POST" });
  };

  return (
    <main className="mx-auto flex h-full w-full max-w-[1500px] flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {workspace && userRole ? (
          <WorkspaceNav
            workspace={workspace}
            campaigns={campaigns}
            userRole={userRole as MemberRole}
          />
        ) : null}
        <div
          className={`min-w-0 flex-1 rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm sm:p-6 ${workspacePanelHeightLgClass} lg:overflow-y-auto`}
        >
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary">
              {workspace ? `${workspace.name} Calls` : "Calls"}
            </h1>
            <Button asChild variant="outline" className="font-Zilla-Slab text-base font-semibold">
              <Link to=".." relative="path">
                Back
              </Link>
            </Button>
          </div>

          <div className="mt-6 space-y-6">
            <section className="space-y-3">
              {!isListening ? (
                <div className="rounded-xl border border-dashed border-border/80 p-4">
                  <p className="font-Zilla-Slab text-lg font-semibold">Pick up incoming calls</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start listening to answer inbound calls to{" "}
                    {handsetNumber ? (
                      <span className="font-mono">{handsetNumber}</span>
                    ) : (
                      "your workspace handset number"
                    )}{" "}
                    without leaving this page.
                  </p>
                  <Button
                    type="button"
                    className="mt-4"
                    onClick={startListening}
                    disabled={pickupFetcher.state !== "idle" || !handsetNumber}
                  >
                    Start listening
                  </Button>
                  {!handsetNumber ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Enable handset on a workspace number in settings first.
                    </p>
                  ) : null}
                </div>
              ) : listenTokenError || !listenToken ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-destructive">
                  {listenTokenError ?? "Unable to connect for incoming pickup."}
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3"
                    onClick={stopListening}
                  >
                    Stop listening
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <IncomingCallReceiver
                    token={listenToken}
                    workspaceId={workspace?.id ?? ""}
                    handsetNumber={handsetNumber}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={stopListening}
                    disabled={pickupFetcher.state !== "idle"}
                  >
                    Stop listening
                  </Button>
                </div>
              )}
            </section>

            {error ? (
              <p className="text-center font-Zilla-Slab text-lg font-semibold text-red-500">
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
        </div>
      </div>
    </main>
  );
}
