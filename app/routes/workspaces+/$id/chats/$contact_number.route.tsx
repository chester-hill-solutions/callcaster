export { loader } from "./$contact_number.loader.server";

import { useOutletContext } from "react-router";
import { ChatThreadView } from "@/components/chats/ChatThreadView";
import type { Workspace, WorkspaceNumber } from "@/lib/types";

type ChatThreadOutletContext = {
  workspace: NonNullable<Workspace>;
  workspaceNumbers: WorkspaceNumber[];
  registerChatActions?: (
    actions: {
      addOptimisticMessage?: (p: {
        body: string;
        from: string;
        to: string;
        media?: string;
      }) => void;
    } | null,
  ) => void;
  contactOptOut?: boolean;
};

export default function ChatScreen() {
  const { workspace, registerChatActions, contactOptOut } =
    useOutletContext<ChatThreadOutletContext>();

  return (
    <ChatThreadView
      workspace={workspace}
      registerChatActions={registerChatActions}
      contactOptOut={contactOptOut}
    />
  );
}
