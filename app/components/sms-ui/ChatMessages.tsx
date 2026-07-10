import { useMemo, useState } from "react";
import { useFetcher } from "react-router";
import {
  formatMessageDateDivider,
  formatMessageTimestamp,
  isSameCalendarDay,
} from "@/lib/utils";
import { getConversationPhoneKey } from "@/lib/chat-conversation-sort";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface Message {
  sid?: string;
  status?: string;
  direction?: string;
  from?: string | null;
  body?: string;
  signedUrls?: string[];
  outbound_media?: string[];
  date_created: string | Date;
  error_message?: string | null;
  scheduled_at?: string | Date | null;
}

/** "Scheduled for {time}" label + Cancel button shown on status="scheduled" messages. */
function ScheduledMessageMeta({
  sid,
  scheduledAt,
  workspaceId,
}: {
  sid?: string;
  scheduledAt?: string | Date | null;
  workspaceId?: string;
}) {
  const cancelFetcher = useFetcher();
  const isCanceling = cancelFetcher.state !== "idle";

  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
      <span>
        Scheduled for{" "}
        {scheduledAt ? formatMessageTimestamp(scheduledAt) : "a later time"}
      </span>
      {sid && workspaceId ? (
        <cancelFetcher.Form
          method="POST"
          action={`/workspaces/${workspaceId}/chats`}
        >
          <input type="hidden" name="intent" value="cancel_scheduled_message" />
          <input type="hidden" name="sid" value={sid} />
          <button
            type="submit"
            disabled={isCanceling}
            className="font-medium text-destructive underline-offset-2 hover:underline disabled:opacity-50"
          >
            {isCanceling ? "Canceling…" : "Cancel"}
          </button>
        </cancelFetcher.Form>
      ) : null}
    </div>
  );
}

interface WorkspaceNumberLabel {
  id?: string | number;
  phone_number: string | null;
  friendly_name?: string | null;
}

interface ChatMessagesProps {
  messages?: Message[];
  /** Workspace numbers, used to label which number sent an outbound message. */
  workspaceNumbers?: WorkspaceNumberLabel[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  /** Ref for the scrollable container (e.g. for scroll position restore when loading older) */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Ref for the "load older" sentinel at the top (infinite scroll) */
  loadMoreSentinelRef?: (node: Element | null) => void;
  /** Whether more older messages are available */
  hasMoreOlder?: boolean;
  /** Whether older messages are currently loading */
  loadingOlder?: boolean;
  /** Workspace id, used to target the Cancel action for scheduled messages. */
  workspaceId?: string;
}

/** Consecutive same-direction messages within this window share one timestamp/caption row. */
const GROUP_WINDOW_MS = 60_000;

export default function ChatMessages({
  messages,
  workspaceNumbers,
  messagesEndRef,
  scrollContainerRef,
  loadMoreSentinelRef,
  hasMoreOlder = false,
  loadingOlder = false,
  workspaceId,
}: ChatMessagesProps) {
  const safeMessages = messages ?? [];
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const workspaceNumberLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const num of workspaceNumbers ?? []) {
      const key = getConversationPhoneKey(num.phone_number);
      if (key) {
        map.set(key, num.friendly_name || num.phone_number || "");
      }
    }
    return map;
  }, [workspaceNumbers]);

  // Only surface the "via" caption when the thread has actually been sent
  // from more than one workspace number — otherwise it's redundant noise.
  const showViaCaptions = useMemo(() => {
    const distinctOutboundKeys = new Set<string>();
    for (const message of safeMessages) {
      if (message.direction === "inbound") continue;
      const key = getConversationPhoneKey(message.from ?? null);
      if (key) distinctOutboundKeys.add(key);
    }
    return distinctOutboundKeys.size > 1;
  }, [safeMessages]);

  return (
    <div
      ref={
        scrollContainerRef as React.RefObject<HTMLDivElement> | undefined
      }
      className="h-full overflow-y-auto p-3 sm:p-4"
    >
      {hasMoreOlder ? (
        <div
          ref={loadMoreSentinelRef}
          className="flex min-h-8 items-center justify-center py-2 text-sm text-muted-foreground"
        >
          {loadingOlder ? "Loading older messages…" : "\u00a0"}
        </div>
      ) : null}
      {safeMessages.length > 0 ? (
        safeMessages.map((message: Message, index: number) => {
          const isFailed = message.status === "failed";
          const isOutbound = message.direction !== "inbound";

          const previousMessage = safeMessages[index - 1];
          const showDateDivider =
            !previousMessage ||
            !isSameCalendarDay(
              previousMessage.date_created,
              message.date_created,
            );

          const nextMessage = safeMessages[index + 1];
          // Show the meta row (timestamp + via caption) on the last message
          // of a run of consecutive same-direction messages sent within the
          // grouping window; always show it around failed messages so
          // delivery status/timing stays visible.
          const showMeta =
            !nextMessage ||
            isFailed ||
            nextMessage.status === "failed" ||
            (nextMessage.direction !== "inbound") !== isOutbound ||
            !isSameCalendarDay(nextMessage.date_created, message.date_created) ||
            Math.abs(
              new Date(nextMessage.date_created).getTime() -
                new Date(message.date_created).getTime(),
            ) >= GROUP_WINDOW_MS;

          const fromKey = getConversationPhoneKey(message.from ?? null);
          const viaLabel = fromKey
            ? workspaceNumberLabelByKey.get(fromKey)
            : undefined;
          const showVia = showViaCaptions && isOutbound && Boolean(viaLabel);

          const attachmentUrls = [
            ...(message.signedUrls ?? []),
            ...(message.outbound_media ?? []),
          ];

          return (
            <div key={message.sid ?? `msg-${index}`}>
              {showDateDivider ? (
                <div className="my-3 flex items-center justify-center">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {formatMessageDateDivider(message.date_created)}
                  </span>
                </div>
              ) : null}
              <div
                className={`message-item mb-4 flex ${
                  isOutbound ? "justify-end" : "justify-start"
                }`}
                data-message-id={message.sid}
                data-message-status={message.status}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 sm:max-w-[70%] sm:p-3 ${
                    isFailed
                      ? "border border-destructive/60 bg-destructive/5 text-foreground"
                      : isOutbound
                        ? "bg-secondary text-secondary-foreground"
                        : "border border-border/70 bg-card text-card-foreground"
                  }`}
                >
                  <p className="text-sm">{message.body}</p>
                  {attachmentUrls.map((url: string, i: number) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setLightboxUrl(url)}
                      className="mt-2 block cursor-zoom-in"
                      aria-label={`View attachment ${i + 1} enlarged`}
                    >
                      <img
                        src={url}
                        alt={`Attachment ${i + 1}`}
                        className="h-auto max-w-full rounded"
                      />
                    </button>
                  ))}
                  {isFailed ? (
                    <div className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
                      <span>Not delivered</span>
                      {message.error_message ? (
                        <span className="font-normal opacity-80">
                          — {message.error_message}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {message.status === "scheduled" ? (
                    <ScheduledMessageMeta
                      sid={message.sid}
                      scheduledAt={message.scheduled_at}
                      workspaceId={workspaceId}
                    />
                  ) : null}
                  {showMeta ? (
                    <div className="mt-1 flex items-center justify-end gap-1.5">
                      {showVia ? (
                        <span className="text-[10px] text-muted-foreground/60">
                          via {viaLabel}
                        </span>
                      ) : null}
                      <small className="text-xs opacity-75">
                        {formatMessageTimestamp(message.date_created)}
                      </small>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">No messages yet</p>
        </div>
      )}
      <div ref={messagesEndRef as React.RefObject<HTMLDivElement>} />
      <Dialog
        open={Boolean(lightboxUrl)}
        onOpenChange={(open) => {
          if (!open) setLightboxUrl(null);
        }}
      >
        <DialogContent className="max-w-3xl border-none bg-transparent p-2 shadow-none sm:p-4">
          <DialogTitle className="sr-only">Image attachment</DialogTitle>
          {lightboxUrl ? (
            <img
              src={lightboxUrl}
              alt="Attachment enlarged"
              className="max-h-[80vh] w-full rounded object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
