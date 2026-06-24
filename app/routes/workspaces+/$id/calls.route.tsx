export { loader } from "./calls.loader.server";
export { action } from "./calls.action.server";

import { Link, useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

import { CallLogTable } from "@/components/calls/CallLogTable";
import { IncomingCallReceiver } from "@/components/calls/IncomingCallReceiver";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/typography";
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

      <section className="space-y-3">
        {!isListening ? (
          <div className="rounded-lg border border-dashed border-border/80 p-4">
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
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-destructive">
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
        <p className="text-center font-Zilla-Slab text-lg font-semibold text-destructive">
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
