import { MdImage, MdSend } from "react-icons/md";
import ChatImages from "./ChatImages";
import type { Contact } from "@/lib/types";
import type { useFetcher } from "@remix-run/react";

type WorkspaceNumber = {
  id: string;
  phone_number: string;
};

type Workspace = {
  id: string;
  name: string;
  owner: string | null;
  users: string[] | null;
  workspace_number?: WorkspaceNumber[];
  created_at: string;
};

interface ChatInputProps {
  workspace: NonNullable<Workspace>;
  workspaceNumbers: WorkspaceNumber[];
  initialFrom: string;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleImageRemove: (imageUrl: string) => void;
  selectedImages: string[];
  selectedContact: Contact | null;
  messageFetcher: ReturnType<typeof useFetcher>;
  phoneNumber: string;
  isValid: boolean;
}

export default function ChatInput({
  initialFrom,
  workspaceNumbers,
  handleSubmit,
  handleImageSelect,
  handleImageRemove,
  selectedImages,
  selectedContact,
  messageFetcher,
  phoneNumber,
  isValid,
}: ChatInputProps) {
  return (
    <div className="border-t bg-white p-3 sm:p-4">
      <messageFetcher.Form
        method="POST"
        className="flex flex-col space-y-2"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="from" className="text-sm font-medium sm:w-[50px]">
            From:
          </label>
          <select
            name="from"
            id="from"
            defaultValue={initialFrom}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm sm:flex-grow"
          >
            {workspaceNumbers?.map((num) => (
              <option key={num.id} value={num.phone_number}>
                {num.phone_number}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 items-start gap-2">
            <label
              htmlFor="image"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-transparent text-gray-500 transition-colors hover:border-blue-200 hover:text-blue-500"
            >
              <MdImage size={24} />
            </label>
            <input
              type="file"
              id="image"
              className="hidden"
              accept="image/*"
              onChange={handleImageSelect}
            />
            <div className="relative flex flex-1">
              <textarea
                required
                placeholder="Type your message"
                rows={3}
                className="min-h-[96px] flex-grow resize-none rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                name="body"
                id="body"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={
              messageFetcher.state !== "idle" ||
              !(selectedContact || (phoneNumber && isValid))
            }
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-500 px-4 text-white transition-colors hover:bg-blue-600 disabled:bg-gray-400 sm:w-10 sm:rounded-full sm:px-0"
            aria-label="Send message"
          >
            <MdSend size={20} />
            <span className="text-sm font-medium sm:hidden">Send</span>
          </button>
        </div>
        {selectedImages.filter(Boolean).length > 0 && (
          <ChatImages
            selectedImages={selectedImages}
            onRemove={handleImageRemove}
          />
        )}
        {phoneNumber && isValid && (
          <input
            hidden
            value={phoneNumber}
            type="hidden"
            name="contact_number"
          />
        )}
        {selectedContact && (
          <input
            hidden
            value={selectedContact.id}
            type="hidden"
            name="contact_id"
          />
        )}
        {selectedImages && (
          <input
            hidden
            type="hidden"
            name="media"
            value={JSON.stringify(selectedImages)}
          />
        )}
      </messageFetcher.Form>
    </div>
  );
}
