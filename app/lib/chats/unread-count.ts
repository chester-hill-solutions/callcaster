export const UNREAD_CONVERSATION_PAGE_SIZE = 100;

export function sumUnreadConversationCount(
  conversations: ReadonlyArray<{ unread_count: number }>,
): number {
  return conversations.reduce(
    (total, conversation) => total + Math.max(0, conversation.unread_count || 0),
    0,
  );
}
