export { loader } from "./$contact_number.loader.server";

import { useOutletContext, useParams } from "react-router";
import { ChatThreadView } from "@/components/chats/ChatThreadView";
import type { Workspace, WorkspaceNumber } from "@/lib/types";

type ChatThreadOutletContext = {
  workspace: NonNullable<Workspace>;
  workspaceNumbers: WorkspaceNumber[];
  registerChatActions?: (
    actions: {
      addOptimisticMessage?: (p: {
        body: string;
        from?: string;
        to: string;
        media?: string;
      }) => void;
    } | null,
  ) => void;
  contactOptOut?: boolean;
};

export default function ChatScreen() {
  const { workspace, workspaceNumbers, registerChatActions, contactOptOut } =
    useOutletContext<ChatThreadOutletContext>();
  const { contact_number } = useParams();

  return (
    <ChatThreadView
      key={contact_number}
      workspace={workspace}
      workspaceNumbers={workspaceNumbers}
      registerChatActions={registerChatActions}
      contactOptOut={contactOptOut}
    />
  );
}
