import { useMemo, useState } from "react";
import { MdImage, MdSend } from "react-icons/md";
import { AlertTriangle } from "lucide-react";
import ChatImages from "./ChatImages";
import { getSmsSegmentInfo } from "@/lib/sms-segments";
import { estimateMessageCredits } from "@/lib/pricing";
import { getConversationPhoneKey } from "@/lib/chat-conversation-sort";
import type { Contact } from "@/lib/types";
import type { useFetcher } from "react-router";

type WorkspaceNumber = {
  id: string;
  phone_number: string;
  friendly_name?: string | null;
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
  /** The workspace number this contact has most recently been texting, if any. */
  establishedFromNumber?: string;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleImageRemove: (imageUrl: string) => void;
  selectedImages: string[];
  selectedContact: Contact | null;
  messageFetcher: ReturnType<typeof useFetcher>;
  phoneNumber: string;
  isValid: boolean;
}

/** Twilio requires scheduled sends at least 15 minutes out — mirrors sms-send-resolve.ts. */
const MIN_SCHEDULE_LEAD_MINUTES = 15;

function minScheduleLocalValue(): string {
  const min = new Date(Date.now() + MIN_SCHEDULE_LEAD_MINUTES * 60 * 1000);
  min.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${min.getFullYear()}-${pad(min.getMonth() + 1)}-${pad(min.getDate())}T${pad(
    min.getHours(),
  )}:${pad(min.getMinutes())}`;
}

export default function ChatInput({
  initialFrom,
  establishedFromNumber,
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
  const [bodyValue, setBodyValue] = useState("");
  const [selectedFrom, setSelectedFrom] = useState(initialFrom);
  const [sendLater, setSendLater] = useState(false);
  const [sendAtLocal, setSendAtLocal] = useState("");
  const segmentInfo = useMemo(() => getSmsSegmentInfo(bodyValue), [bodyValue]);
  const hasMedia = selectedImages.filter(Boolean).length > 0;
  const creditEstimate = useMemo(
    () => estimateMessageCredits({ body: bodyValue, hasMedia }),
    [bodyValue, hasMedia],
  );
  const optedOut = Boolean(selectedContact?.opt_out);
  const minScheduleValue = useMemo(() => minScheduleLocalValue(), []);

  const establishedLabel = useMemo(() => {
    if (!establishedFromNumber) return "";
    const establishedKey = getConversationPhoneKey(establishedFromNumber);
    const matchedNumber = workspaceNumbers?.find(
      (num) => getConversationPhoneKey(num.phone_number) === establishedKey,
    );
    return (
      matchedNumber?.friendly_name || matchedNumber?.phone_number || establishedFromNumber
    );
  }, [establishedFromNumber, workspaceNumbers]);

  const isFromMismatched = useMemo(() => {
    if (!establishedFromNumber || !selectedFrom) return false;
    return (
      getConversationPhoneKey(selectedFrom) !==
      getConversationPhoneKey(establishedFromNumber)
    );
  }, [establishedFromNumber, selectedFrom]);

  const isSendDisabled =
    messageFetcher.state !== "idle" ||
    optedOut ||
    !(selectedContact || (phoneNumber && isValid)) ||
    (sendLater && !sendAtLocal);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    handleSubmit(e);
    setBodyValue("");
    setSendLater(false);
    setSendAtLocal("");
  };

  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (isSendDisabled) return;
    e.currentTarget.form?.requestSubmit();
  };

  return (
    <div className="border-t border-border/70 bg-background/90 p-3 sm:p-4">
      <messageFetcher.Form
        method="POST"
        className="flex flex-col space-y-2"
        onSubmit={handleFormSubmit}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="from" className="text-sm font-medium sm:w-[50px]">
            From:
          </label>
          <select
            name="from"
            id="from"
            value={selectedFrom}
            onChange={(e) => setSelectedFrom(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground sm:flex-grow"
          >
            {workspaceNumbers?.map((num) => (
              <option key={num.id} value={num.phone_number}>
                {num.friendly_name || num.phone_number}
              </option>
            ))}
          </select>
        </div>
        {isFromMismatched && (
          <div
            role="status"
            className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              This contact has been texting {establishedLabel}. Sending from a
              different number starts a new thread on their phone.
            </span>
          </div>
        )}
        {optedOut && (
          <div
            role="status"
            className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>This contact has opted out. Sending is disabled.</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={sendLater}
              onChange={(e) => {
                setSendLater(e.target.checked);
                if (!e.target.checked) setSendAtLocal("");
              }}
              className="h-3.5 w-3.5"
            />
            Send later
          </label>
          {sendLater && (
            <input
              type="datetime-local"
              value={sendAtLocal}
              min={minScheduleValue}
              required
              onChange={(e) => setSendAtLocal(e.target.value)}
              className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground"
              aria-label="Send at"
            />
          )}
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
            <div className="relative flex flex-1 flex-col gap-1">
              <textarea
                required
                placeholder="Type your message"
                rows={3}
                className="min-h-[96px] flex-grow resize-none rounded-md border border-input bg-background p-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                name="body"
                id="body"
                onChange={(e) => setBodyValue(e.target.value)}
                onKeyDown={handleBodyKeyDown}
              />
              <div
                className="flex items-center justify-end gap-2 px-1 text-xs text-muted-foreground"
                aria-live="polite"
              >
                <span className="mr-auto hidden sm:inline">
                  Enter to send · Shift+Enter for a new line
                </span>
                <span>
                  {segmentInfo.unitsUsedInCurrentSegment}/
                  {segmentInfo.unitsPerSegment}
                </span>
                <span>
                  {Math.max(segmentInfo.segmentCount, 1)} segment
                  {Math.max(segmentInfo.segmentCount, 1) === 1 ? "" : "s"}
                </span>
                <span>({segmentInfo.encoding})</span>
                <span className="font-medium text-foreground/80">
                  ≈ {creditEstimate.credits} credit
                  {creditEstimate.credits === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={isSendDisabled}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground sm:w-10 sm:rounded-full sm:px-0"
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
        {sendLater && sendAtLocal && (
          <input
            hidden
            type="hidden"
            name="send_at"
            value={new Date(sendAtLocal).toISOString()}
          />
        )}
      </messageFetcher.Form>
    </div>
  );
}
