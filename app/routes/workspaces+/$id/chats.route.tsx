export { loader } from "./chats.loader.server";
export { action } from "./chats.action.server";

import { Outlet, useRouteError } from "react-router";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader as MobileSheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import ChatHeader from "@/components/sms-ui/ChatHeader";
import ChatInput from "@/components/sms-ui/ChatInput";
import ChatAddContactDialog from "@/components/sms-ui/ChatAddContactDialog";
import { ConversationSidebar } from "./chats/ConversationSidebar";
import { useChatsPage } from "@/hooks/chats/useChatsPage";
import { logger } from "@/lib/logger.client";
import type { Workspace } from "@/lib/types";

export default function ChatsList() {
  const {
    supabase,
    workspace,
    workspaceNumbers,
    registerChatActions,
    outlet,
    contact,
    potentialContacts,
    phoneNumber,
    contact_number,
    handlePhoneChange,
    isValid,
    selectedContact,
    contacts,
    toggleContactMenu,
    isContactMenuOpen,
    handleContactSelect,
    dropdownRef,
    searchError,
    existingConversation,
    handleExistingConversationClick,
    setDialog,
    dialogContact,
    isMobileConversationListOpen,
    setIsMobileConversationListOpen,
    sidebarProps,
    chatInputWorkspaceNumbers,
    handleSubmit,
    handleImageSelect,
    handleImageRemove,
    selectedImages,
    messageFetcher,
    contactOptOut,
  } = useChatsPage();

  return (
    <main className="flex min-h-[68vh] w-full flex-col gap-4 md:flex-row">
      <Card className="flex h-[68vh] max-h-[68vh] hidden flex-col overflow-hidden border-border/80 bg-card/80 md:flex md:max-w-[40%] md:basis-2/5">
        <ConversationSidebar {...sidebarProps} />
      </Card>

      <Card className="flex min-h-[68vh] w-full min-w-0 flex-1 flex-col overflow-hidden border-border/80 bg-card/80 md:basis-3/5">
        <ChatHeader
          contact={contact}
          outlet={Boolean(outlet)}
          potentialContacts={potentialContacts}
          phoneNumber={phoneNumber}
          contactNumber={contact_number}
          handlePhoneChange={handlePhoneChange}
          isValid={isValid}
          selectedContact={selectedContact}
          contacts={contacts}
          toggleContactMenu={toggleContactMenu}
          isContactMenuOpen={isContactMenuOpen}
          handleContactSelect={handleContactSelect}
          dropdownRef={dropdownRef}
          searchError={searchError || undefined}
          existingConversation={existingConversation}
          handleExistingConversationClick={handleExistingConversationClick}
          setDialog={(nextContact) => setDialog(nextContact as typeof contact)}
          onShowConversationList={() => setIsMobileConversationListOpen(true)}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted/30">
          <Outlet
            context={{
              supabase,
              workspace,
              workspaceNumbers,
              registerChatActions,
              contactOptOut,
            }}
          />
        </div>
        <ChatInput
          isValid={isValid}
          phoneNumber={phoneNumber}
          workspace={workspace as NonNullable<Workspace>}
          workspaceNumbers={chatInputWorkspaceNumbers}
          initialFrom={chatInputWorkspaceNumbers[0]?.phone_number || ""}
          handleSubmit={handleSubmit}
          handleImageSelect={handleImageSelect}
          handleImageRemove={handleImageRemove}
          selectedImages={selectedImages}
          selectedContact={selectedContact}
          messageFetcher={messageFetcher}
        />
      </Card>
      <Sheet
        open={isMobileConversationListOpen}
        onOpenChange={setIsMobileConversationListOpen}
      >
        <SheetContent side="left" className="w-[88vw] p-0 md:hidden">
          <MobileSheetHeader className="border-b px-4 py-3">
            <SheetTitle>Chats</SheetTitle>
          </MobileSheetHeader>
          <div className="h-[calc(100%-57px)]">
            <ConversationSidebar {...sidebarProps} />
          </div>
        </SheetContent>
      </Sheet>
      <ChatAddContactDialog
        existingContact={dialogContact}
        isDialogOpen={Boolean(dialogContact?.phone)}
        setDialog={(open) => setDialog(open ? dialogContact : null)}
        contact_number={contact_number}
        workspace_id={workspace.id}
      />
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  logger.error("Chats route error boundary caught error:", error);
  return <div className="p-4 text-sm text-red-500">Error loading chats.</div>;
}
