import { useEffect, useMemo, useRef, useState } from "react";
import { MdChat } from "react-icons/md";
import {
  getConversationPhoneKey,
  type ConversationSummary,
} from "@/lib/chat-conversation-sort";
import { WorkspaceResourceEmptyState } from "@/components/workspace/WorkspaceResourceListShell";

const ROW_HEIGHT = 80;
const OVERSCAN_ROWS = 6;
const DEFAULT_VIEWPORT_HEIGHT = 600;

type VirtualViewport = {
  height: number;
  listOffset: number;
  scrollTop: number;
};

function getConversationDisplayName(chat: ConversationSummary): string {
  const fullName = [chat.contact_firstname, chat.contact_surname]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .trim();

  return fullName || chat.contact_phone;
}

function getMessageCountLabel(chat: ConversationSummary): string {
  return `${chat.message_count} ${chat.message_count === 1 ? "message" : "messages"}`;
}

// ConversationSummary only carries the last INBOUND message body today
// (last_inbound_body). There is no last-outbound-body field yet, so we can't
// distinguish "You: ..." previews from contact previews -- once a server
// field for the last outbound body exists, prefix outbound previews with
// "You: " here.
function getConversationPreview(chat: ConversationSummary): string {
  const body = chat.last_inbound_body?.trim();
  return body || getMessageCountLabel(chat);
}

type ConversationListProps = {
  chats: ConversationSummary[];
  scrollRoot?: HTMLElement | null;
  contactNumber?: string;
  handleExistingConversationClick: (phoneNumber: string) => void;
  formatDate: (value: string) => string;
};

export function ConversationList({
  chats,
  scrollRoot = null,
  contactNumber,
  handleExistingConversationClick,
  formatDate,
}: ConversationListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<VirtualViewport>({
    height: DEFAULT_VIEWPORT_HEIGHT,
    listOffset: 0,
    scrollTop: 0,
  });

  const shapedChats = useMemo(() => {
    const seenPhoneKeys = new Set<string>();
    return chats.filter((chat): chat is ConversationSummary => {
      if (!chat?.contact_phone) return false;

      const phoneKey = getConversationPhoneKey(chat.contact_phone);
      // Keep the prior phoneNumbersMatch behavior for legacy rows that have no
      // digits: all such rows share the empty comparison key.
      const comparisonKey = phoneKey ?? "";
      if (seenPhoneKeys.has(comparisonKey)) return false;
      seenPhoneKeys.add(comparisonKey);
      return true;
    });
  }, [chats]);

  /**
   * @effect Keep the virtual row window aligned with the conversation scroll root.
   * @effect-deps [scrollRoot, shapedChats.length] Rebind when the scroll container or list size changes.
   * @effect-side-effects dom (scroll listener and ResizeObserver) + local viewport state; cleaned up on rerun/unmount.
   * @effect-why-not-loader Scroll position and element dimensions are live browser state that loaders cannot provide.
   */
  useEffect(() => {
    const list = listRef.current;
    if (!scrollRoot || !list) return;

    const updateViewport = () => {
      const rootBounds = scrollRoot.getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      setViewport({
        height: scrollRoot.clientHeight || DEFAULT_VIEWPORT_HEIGHT,
        listOffset: listBounds.top - rootBounds.top + scrollRoot.scrollTop,
        scrollTop: scrollRoot.scrollTop,
      });
    };

    updateViewport();
    scrollRoot.addEventListener("scroll", updateViewport, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateViewport);
    resizeObserver?.observe(scrollRoot);

    return () => {
      scrollRoot.removeEventListener("scroll", updateViewport);
      resizeObserver?.disconnect();
    };
  }, [scrollRoot, shapedChats.length]);

  if (shapedChats.length === 0) {
    return (
      <WorkspaceResourceEmptyState
        emptyMessage="No conversations yet"
        emptyDescription="Use the New Chat button above to pick a contact and start texting."
        emptyIcon={<MdChat className="h-7 w-7" aria-hidden="true" />}
      />
    );
  }

  const visibleStart = Math.max(
    0,
    Math.floor(
      Math.max(0, viewport.scrollTop - viewport.listOffset) / ROW_HEIGHT,
    ) - OVERSCAN_ROWS,
  );
  const visibleEnd = Math.min(
    shapedChats.length,
    Math.ceil(
      Math.max(
        0,
        viewport.scrollTop + viewport.height - viewport.listOffset,
      ) / ROW_HEIGHT,
    ) + OVERSCAN_ROWS,
  );
  const visibleChats = shapedChats.slice(visibleStart, visibleEnd);

  return (
    <div
      ref={listRef}
      role="list"
      aria-label="Conversations"
      className="relative conversation-list-virtual-height"
      style={
        {
          "--conversation-list-height": `${shapedChats.length * ROW_HEIGHT}px`,
        } as React.CSSProperties
      }
    >
      {visibleChats.map((chat, index) => {
        const position = visibleStart + index;
        return (
          <div
            key={chat.contact_phone}
            role="listitem"
            aria-posinset={position + 1}
            aria-setsize={shapedChats.length}
            className="absolute inset-x-0 conversation-list-virtual-row"
            style={
              {
                "--conversation-list-row-height": `${ROW_HEIGHT}px`,
                "--conversation-list-row-top": `${position * ROW_HEIGHT}px`,
              } as React.CSSProperties
            }
          >
            <button
              type="button"
              className={`flex h-full w-full items-center justify-between border-b border-border/70 p-4 text-left transition-colors hover:bg-muted/70 ${
                chat.contact_phone === contactNumber ? "bg-secondary/50" : ""
              }`}
              onClick={() => handleExistingConversationClick(chat.contact_phone)}
            >
              <div className="flex min-w-0 flex-1 items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <MdChat size={20} />
                </div>
                <div className="ml-4 min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {getConversationDisplayName(chat)}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {chat.contact_phone} • {getConversationPreview(chat)}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="text-xs text-muted-foreground">
                  {formatDate(chat.conversation_last_update)}
                </div>
                {chat.unread_count > 0 ? (
                  <div className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
                    {chat.unread_count}
                  </div>
                ) : null}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
