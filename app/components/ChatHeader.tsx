import { Contact } from "~/lib/types";
import { Database } from "~/lib/database.types";
import { useNavigate } from "@remix-run/react";
import { normalizePhoneNumber } from "~/lib/utils";

type ConversationSummary = Database["public"]["Functions"]["get_conversation_summary"]["Returns"][0];
type ChatsData = {
  chats: ConversationSummary[];
  chatsError: any;
};

const ChatHeader = () => {
  const navigate = useNavigate();

  const renderChats = (chatsData: ChatsData) => {
    if (!chatsData.chats) return null;
    return chatsData.chats
      .filter((chat): chat is ConversationSummary => chat !== undefined)
      .map((chat) => (
        <div
          key={chat.contact_phone}
          className="flex items-center justify-between p-4 hover:bg-gray-100 cursor-pointer"
          onClick={() => {
            const normalizedPhone = normalizePhoneNumber(chat.contact_phone);
            if (normalizedPhone) {
              navigate(`/chats/${normalizedPhone}`);
            }
          }}
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-xl">
                {chat.contact_firstname?.[0]?.toUpperCase() || "?"}
              </span>
            </div>
            <div>
              <h3 className="font-semibold">
                {chat.contact_firstname} {chat.contact_surname}
              </h3>
              <p className="text-sm text-gray-500">{chat.contact_phone}</p>
            </div>
          </div>
          {chat.unread_count > 0 && (
            <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
              {chat.unread_count}
            </div>
          )}
        </div>
      ));
  };

  // ... rest of the component
};

export default ChatHeader; 