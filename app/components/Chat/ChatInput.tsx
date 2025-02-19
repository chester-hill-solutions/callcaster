import { MdSend, MdImage } from "react-icons/md";
import MessagesImages from "./ChatImages";
import type { Contact } from "~/lib/types";
import type { Database } from "~/lib/database.types";
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
  workspace,
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
    <div className="border-t bg-white p-4">
      <messageFetcher.Form
        method="POST"
        className="flex flex-col space-y-2"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center space-x-2">
          <label htmlFor="from" className="w-[50px] text-sm font-medium">
            From:
          </label>
          <select
            name="from"
            id="from"
            defaultValue={initialFrom}
            className="flex-grow rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {workspaceNumbers?.map((num) => (
              <option key={num.id} value={num.phone_number}>
                {num.phone_number}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <label
            htmlFor="image"
            className="flex w-[50px] cursor-pointer justify-center"
          >
            <div className="">
              <MdImage
                size={24}
                className="text-gray-500 hover:text-blue-500"
              />
            </div>
          </label>
          <input
            type="file"
            id="image"
            className="hidden"
            accept="image/*"
            onChange={handleImageSelect}
          />
          <div className="relative flex flex-auto">
            <textarea
              required
              placeholder="Type your message"
              rows={3}
              className="flex-grow resize-none rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              name="body"
              id="body"
            />
          </div>
          <button
            type="submit"
            disabled={
              messageFetcher.state !== "idle" ||
              !(selectedContact || (phoneNumber && isValid))
            }
            className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:bg-gray-400"
            aria-label="Send message"
          >
            <MdSend size={20} />
          </button>
        </div>
        {selectedImages.filter(Boolean).length > 0 && (
          <MessagesImages
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
