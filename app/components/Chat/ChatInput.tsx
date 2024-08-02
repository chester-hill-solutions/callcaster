import { MdSend, MdImage } from "react-icons/md";
import MessagesImages from "./ChatImages";

export default function ChatInput({
  workspace,
  initialFrom,
  handleSubmit,
  handleImageSelect,
  handleImageRemove,
  selectedImages,
  selectedContact,
  messageFetcher,
  phoneNumber,
  isValid,
}) {
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
            {workspace?.workspace_number?.map((num) => (
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
