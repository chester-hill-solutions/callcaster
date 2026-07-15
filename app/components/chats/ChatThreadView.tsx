import ChatMessages from "@/components/sms-ui/ChatMessages";
import { ChatOptOutBanner } from "@/components/chats/ChatOptOutBanner";
import { useChatThread } from "@/hooks/chats/useChatThread";
import type { Workspace, WorkspaceNumber } from "@/lib/types";

type ChatThreadViewProps = {
  workspace: NonNullable<Workspace>;
  workspaceNumbers?: WorkspaceNumber[];
  registerChatActions?: (
    actions: {
      addOptimisticMessage?: (p: {
        body: string;
        from?: string;
        to: string;
        media?: string;
        sid?: string;
      }) => void;
      markOptimisticMessageFailed?: (sid: string) => void;
    } | null,
  ) => void;
  contactOptOut?: boolean;
};

export function ChatThreadView({
    workspace,
  workspaceNumbers,
  registerChatActions,
  contactOptOut,
}: ChatThreadViewProps) {
  const {
    contact_number,
    messages,
    messagesEndRef,
    scrollContainerRef,
    loadMoreSentinelRef,
    hasMoreOlder,
    loadingOlder,
    optedOut,
  } = useChatThread({
        workspace,
    registerChatActions,
    contactOptOut,
  });

  return (
    <div className="flex h-full flex-col">
      <ChatOptOutBanner contactPhone={contact_number} optedOut={optedOut} />
      <ChatMessages
        messages={
          messages as React.ComponentProps<typeof ChatMessages>["messages"]
        }
        workspaceNumbers={
          workspaceNumbers as React.ComponentProps<
            typeof ChatMessages
          >["workspaceNumbers"]
        }
        messagesEndRef={messagesEndRef}
        scrollContainerRef={scrollContainerRef}
        loadMoreSentinelRef={loadMoreSentinelRef}
        hasMoreOlder={hasMoreOlder}
        loadingOlder={loadingOlder}
        workspaceId={workspace.id}
      />
    </div>
  );
}
