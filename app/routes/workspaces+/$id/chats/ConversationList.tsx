import { MdChat } from "react-icons/md";
import { phoneNumbersMatch } from "@/hooks/realtime/useChatRealtime";
import type { ConversationSummary } from "@/lib/chat-conversation-sort";

function getConversationDisplayName(chat: ConversationSummary): string {
  const fullName = [chat.contact_firstname, chat.contact_surname]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .trim();

  return fullName || chat.contact_phone;
}

type ConversationListProps = {
  chats: ConversationSummary[];
  contactNumber?: string;
  handleExistingConversationClick: (phoneNumber: string) => void;
  formatDate: (value: string) => string;
};

export function ConversationList({
  chats,
  contactNumber,
  handleExistingConversationClick,
  formatDate,
}: ConversationListProps) {
  const shapedChats = chats.filter(
    (chat, index): chat is ConversationSummary =>
      Boolean(chat?.contact_phone) &&
      chats.findIndex((candidate) =>
        phoneNumbersMatch(candidate?.contact_phone ?? null, chat.contact_phone),
      ) === index,
  );

  if (shapedChats.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No conversations yet
      </div>
    );
  }

  return (
    <>
      {shapedChats
        .filter((chat): chat is ConversationSummary =>
          Boolean(chat?.contact_phone),
        )
        .map((chat) => (
          <button
            type="button"
            key={chat.contact_phone}
            className={`flex w-full items-center justify-between border-b border-border/70 p-4 text-left transition-colors hover:bg-muted/70 ${
              chat.contact_phone === contactNumber ? "bg-secondary/50" : ""
            }`}
            onClick={() => handleExistingConversationClick(chat.contact_phone)}
          >
            <div className="flex items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MdChat size={20} />
              </div>
              <div className="ml-4">
                <div className="font-medium">
                  {getConversationDisplayName(chat)}
                </div>
                <div className="line-clamp-1 text-sm text-muted-foreground">
                  {chat.contact_phone} • {chat.message_count}{" "}
                  {chat.message_count === 1 ? "message" : "messages"}
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
        ))}
    </>
  );
}
