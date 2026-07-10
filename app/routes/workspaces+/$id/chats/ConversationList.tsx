import { MdChat } from "react-icons/md";
import { phoneNumbersMatch } from "@/hooks/realtime/useChatRealtime";
import type { ConversationSummary } from "@/lib/chat-conversation-sort";
import { Card, CardHeader } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";

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
      <div className="flex items-center justify-center p-4">
        <Card className="w-full max-w-sm border-none bg-transparent shadow-none">
          <CardHeader className="items-center gap-2 text-center">
            <Heading as="h2" level={4} branded={false}>
              No conversations yet
            </Heading>
            <Text variant="muted">
              Use the New Chat button above to pick a contact and start
              texting.
            </Text>
          </CardHeader>
        </Card>
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
            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MdChat size={20} />
              </div>
              <div className="ml-4 min-w-0 flex-1">
                <div className="font-medium">
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
        ))}
    </>
  );
}
