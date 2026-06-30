import type { Contact, WorkspaceNumber } from "@/lib/types";
import type { ConversationSummary } from "@/lib/chat-conversation-sort";

export interface Campaign {
  id: number;
  title: string;
  type: string;
  status: string;
  created_at: string;
}

export interface RouteWorkspaceNumber {
  id: number;
  phone_number: string | null;
}

export interface Chat {
  contact_phone: string;
  user_phone: string;
  conversation_start: string;
  conversation_last_update: string;
  message_count: number;
  unread_count: number;
}

export type ChatsLoaderData = {
  campaigns: Campaign[];
  chats: ConversationSummary[];
  chatsError: string | null;
  potentialContacts: Contact[];
  contact: Contact | null;
  error: string | null;
  optOutKeywords: string[];
  userRole: string;
  contact_number: string | undefined;
  workspaceNumbers: RouteWorkspaceNumber[];
  pagination: {
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
};

export type ImageFetcherData = {
  success: boolean;
  url: string;
  error?: string;
};

export type ChatsWorkspaceContextType = {
  client: import("@client/client-js").never<
    import("@/lib/db-types").Database
  >;
  workspace: {
    id: string;
    name: string;
    owner: string | null;
    users: string[] | null;
    workspace_number?: RouteWorkspaceNumber[];
    created_at: string;
  };
};

export type ChatInputWorkspaceNumber = {
  id: string;
  phone_number: string;
};

export type { WorkspaceNumber };
