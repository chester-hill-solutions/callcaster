import { formatMessageTimestamp } from "@/lib/utils";

interface Message {
  sid?: string;
  status?: string;
  direction?: string;
  body?: string;
  signedUrls?: string[];
  outbound_media?: string[];
  date_created: string | Date;
}

interface ChatMessagesProps {
  messages?: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  /** Ref for the scrollable container (e.g. for scroll position restore when loading older) */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Ref for the "load older" sentinel at the top (infinite scroll) */
  loadMoreSentinelRef?: (node: Element | null) => void;
  /** Whether more older messages are available */
  hasMoreOlder?: boolean;
  /** Whether older messages are currently loading */
  loadingOlder?: boolean;
}

export default function ChatMessages({
  messages,
  messagesEndRef,
  scrollContainerRef,
  loadMoreSentinelRef,
  hasMoreOlder = false,
  loadingOlder = false,
}: ChatMessagesProps) {
  const safeMessages = messages ?? [];

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
        safeMessages.map((message: Message, index: number) => (
          <div
            key={message.sid ?? `msg-${index}`}
            className={`message-item mb-4 flex ${
              message.direction !== "inbound" ? "justify-end" : "justify-start"
            }`}
            data-message-id={message.sid}
            data-message-status={message.status}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 sm:max-w-[70%] sm:p-3 ${
                message.direction !== "inbound"
                  ? "bg-secondary text-secondary-foreground"
                  : "border border-border/70 bg-card text-card-foreground"
              }`}
            >
              <p className="text-sm">{message.body}</p>
              {message.signedUrls?.map((url: string, i: number) => (
                <img
                  key={i}
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  className="mt-2 h-auto max-w-full rounded"
                />
              ))}
              {message.outbound_media?.map((url: string, i: number) => (
                <img
                  key={i}
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  className="mt-2 h-auto max-w-full rounded"
                />
              ))}
              <div className="mt-1 text-right">
                <small className="text-xs opacity-75">
                  {formatMessageTimestamp(message.date_created)}
                </small>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">No messages yet</p>
        </div>
      )}
      <div ref={messagesEndRef as React.RefObject<HTMLDivElement>} />
    </div>
  );
}
