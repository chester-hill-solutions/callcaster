import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ImageIcon, SendHorizontal } from "lucide-react";
import ChatImages from "./ChatImages";
import { getSmsSegmentInfo } from "@/lib/sms-segments";
import { estimateMessageCredits } from "@/lib/pricing";
import { getConversationPhoneKey } from "@/lib/chat-conversation-sort";
import { MESSAGING_SERVICE_SENDER_VALUE } from "@/lib/sms-campaign-send-mode";
import type { Contact } from "@/lib/types";
import type { useFetcher } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  senderSelection: {
    /** The composer's initial sender selection, not a lock. */
    defaultMode: "from_number" | "messaging_service";
    messagingServiceReady: boolean;
  };
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
const MAX_SCHEDULE_LEAD_DAYS = 35;

function scheduleLocalValue(date: Date): string {
  date.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function minScheduleLocalValue(): string {
  return scheduleLocalValue(
    new Date(Date.now() + MIN_SCHEDULE_LEAD_MINUTES * 60 * 1000),
  );
}

function maxScheduleLocalValue(): string {
  return scheduleLocalValue(
    new Date(Date.now() + MAX_SCHEDULE_LEAD_DAYS * 24 * 60 * 60 * 1000),
  );
}

export default function ChatInput({
  initialFrom,
  establishedFromNumber,
  workspaceNumbers,
  senderSelection,
  handleSubmit,
  handleImageSelect,
  handleImageRemove,
  selectedImages,
  selectedContact,
  messageFetcher,
  phoneNumber,
  isValid,
}: ChatInputProps) {
  const messagingServiceReady = senderSelection.messagingServiceReady;
  const [bodyValue, setBodyValue] = useState("");
  const [selectedFrom, setSelectedFrom] = useState(() =>
    senderSelection.defaultMode === "messaging_service" && messagingServiceReady
      ? MESSAGING_SERVICE_SENDER_VALUE
      : initialFrom,
  );
  const [sendLater, setSendLater] = useState(false);
  const [sendAtLocal, setSendAtLocal] = useState("");
  const submittedScheduleRef = useRef(false);
  const observedSubmissionRef = useRef(false);
  const segmentInfo = useMemo(() => getSmsSegmentInfo(bodyValue), [bodyValue]);
  const hasMedia = selectedImages.filter(Boolean).length > 0;
  const creditEstimate = useMemo(
    () => estimateMessageCredits({ body: bodyValue, hasMedia }),
    [bodyValue, hasMedia],
  );
  const optedOut = Boolean(selectedContact?.opt_out);
  const minScheduleValue = useMemo(() => minScheduleLocalValue(), []);
  const maxScheduleValue = useMemo(() => maxScheduleLocalValue(), []);
  const hasNumberOptions = (workspaceNumbers?.length ?? 0) > 0;
  const hasSenderOptions = hasNumberOptions || messagingServiceReady;
  const usesMessagingService = selectedFrom === MESSAGING_SERVICE_SENDER_VALUE;
  const scheduleHint = usesMessagingService
    ? undefined
    : messagingServiceReady
      ? "Select Messaging Service to schedule"
      : "Scheduling requires Messaging Service";

  /**
   * @effect KEEP: align the controlled From selection with available sender
   * options when `initialFrom` or the workspace number inventory changes
   * without remounting the composer (same contact, loader refresh).
   * @effect-deps initialFrom, workspaceNumbers (available sender option values)
   * @effect-side-effects setSelectedFrom only
   * @effect-why-not-loader selectedFrom is intentional user-controlled state;
   * we only repair it when it points at a value no longer in the option list
   * or when the computed default changes while the select was empty.
   */
  useEffect(() => {
    const optionValues = new Set(
      (workspaceNumbers ?? []).map((num) => num.phone_number),
    );
    if (messagingServiceReady) {
      optionValues.add(MESSAGING_SERVICE_SENDER_VALUE);
    }
    if (selectedFrom && optionValues.has(selectedFrom)) return;
    if (initialFrom && optionValues.has(initialFrom)) {
      setSelectedFrom(initialFrom);
      return;
    }
    setSelectedFrom(
      workspaceNumbers?.[0]?.phone_number ||
        (messagingServiceReady ? MESSAGING_SERVICE_SENDER_VALUE : ""),
    );
  }, [initialFrom, workspaceNumbers, selectedFrom, messagingServiceReady]);

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
    if (usesMessagingService) return false;
    if (!establishedFromNumber || !selectedFrom) return false;
    return (
      getConversationPhoneKey(selectedFrom) !==
      getConversationPhoneKey(establishedFromNumber)
    );
  }, [establishedFromNumber, selectedFrom, usesMessagingService]);

  const isSendDisabled =
    messageFetcher.state !== "idle" ||
    optedOut ||
    (!usesMessagingService && (!selectedFrom || !hasNumberOptions)) ||
    !(selectedContact || (phoneNumber && isValid)) ||
    (sendLater && !sendAtLocal);

  /**
   * @effect After a scheduled-send submission completes, clear the schedule
   * controls on success or leave them intact when the server returns an error.
   * @effect-deps messageFetcher.data, messageFetcher.state (tracks the
   * submission lifecycle via submittedScheduleRef / observedSubmissionRef)
   * @effect-side-effects setSendLater, setSendAtLocal only
   * @effect-why-not-loader Schedule UI state is client-controlled; we only
   * reset it once the fetcher settles after an explicit user submit.
   */
  useEffect(() => {
    if (!submittedScheduleRef.current) return;
    if (messageFetcher.state !== "idle") {
      observedSubmissionRef.current = true;
      return;
    }
    if (!observedSubmissionRef.current) return;

    const data = messageFetcher.data as { error?: string } | undefined;
    if (!data?.error) {
      setSendLater(false);
      setSendAtLocal("");
    }
    submittedScheduleRef.current = false;
    observedSubmissionRef.current = false;
  }, [messageFetcher.data, messageFetcher.state]);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    submittedScheduleRef.current = sendLater;
    handleSubmit(e);
    setBodyValue("");
  };

  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (isSendDisabled) return;
    e.currentTarget.form?.requestSubmit();
  };

  const segmentCount = Math.max(segmentInfo.segmentCount, 1);

  return (
    <div className="border-t border-border/70 bg-background/90 p-3 sm:p-4">
      <messageFetcher.Form
        method="POST"
        className="flex flex-col gap-3"
        onSubmit={handleFormSubmit}
      >
        {!hasSenderOptions ? (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              A workspace sending number is required before chat messages can be
              sent.
            </AlertDescription>
          </Alert>
        ) : null}
        {isFromMismatched ? (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              This contact has been texting {establishedLabel}. Sending from a
              different number starts a new thread on their phone.
            </AlertDescription>
          </Alert>
        ) : null}
        {optedOut ? (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              This contact has opted out. Sending is disabled.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Label
              htmlFor="from"
              className="shrink-0 text-xs font-medium text-muted-foreground"
            >
              From
            </Label>
            <div className="min-w-0 flex-1">
              <Select
                value={selectedFrom || undefined}
                onValueChange={(next) => {
                  setSelectedFrom(next);
                  if (next !== MESSAGING_SERVICE_SENDER_VALUE) {
                    setSendLater(false);
                    setSendAtLocal("");
                  }
                }}
                disabled={!hasSenderOptions}
              >
                <SelectTrigger id="from" className="h-8 w-full">
                  <SelectValue
                    placeholder={
                      hasSenderOptions
                        ? "Select sender"
                        : "No sending numbers available"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {messagingServiceReady ? (
                    <SelectItem value={MESSAGING_SERVICE_SENDER_VALUE}>
                      Messaging Service (automatic sender)
                    </SelectItem>
                  ) : null}
                  {workspaceNumbers?.map((num) => (
                    <SelectItem key={num.id} value={num.phone_number}>
                      {num.friendly_name || num.phone_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input type="hidden" name="from" value={selectedFrom} />
          </div>

          <div
            className="flex shrink-0 items-center gap-2"
            title={scheduleHint}
          >
            <Checkbox
              id="send-later"
              checked={sendLater}
              disabled={!usesMessagingService}
              onCheckedChange={(checked) => {
                const enabled = checked === true;
                setSendLater(enabled);
                if (!enabled) setSendAtLocal("");
              }}
            />
            <Label
              htmlFor="send-later"
              className="text-xs font-normal text-muted-foreground"
            >
              Send later
            </Label>
            {scheduleHint ? (
              <span className="sr-only">{scheduleHint}</span>
            ) : null}
            {sendLater ? (
              <Input
                type="datetime-local"
                value={sendAtLocal}
                min={minScheduleValue}
                max={maxScheduleValue}
                required
                onChange={(e) => setSendAtLocal(e.target.value)}
                className="h-8 w-auto px-2 py-1 text-xs"
                aria-label="Send at"
              />
            ) : null}
          </div>
        </div>

        {selectedImages.filter(Boolean).length > 0 ? (
          <ChatImages
            selectedImages={selectedImages}
            onRemove={handleImageRemove}
          />
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border/80 bg-background focus-within:border-ring">
          <Textarea
            required
            placeholder="Type your message"
            rows={3}
            title="Enter to send · Shift+Enter for a new line"
            className="min-h-[88px] resize-none rounded-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0"
            name="body"
            id="body"
            onChange={(e) => setBodyValue(e.target.value)}
            onKeyDown={handleBodyKeyDown}
            aria-describedby="chat-input-meta"
          />
          <div className="flex items-center gap-2 border-t border-border/60 px-2 py-1.5">
            <label
              htmlFor="image"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ImageIcon className="h-4 w-4" aria-hidden />
              <span className="sr-only">Attach image</span>
            </label>
            <input
              type="file"
              id="image"
              className="sr-only"
              accept="image/*"
              onChange={handleImageSelect}
            />
            <div
              id="chat-input-meta"
              className="ml-auto flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              <span>
                {segmentInfo.unitsUsedInCurrentSegment}/
                {segmentInfo.unitsPerSegment}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {segmentCount} segment{segmentCount === 1 ? "" : "s"}
              </span>
              <span aria-hidden="true">·</span>
              <span>({segmentInfo.encoding})</span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-foreground/80">
                ≈ {creditEstimate.credits} credit
                {creditEstimate.credits === 1 ? "" : "s"}
              </span>
            </div>
            <Button
              type="submit"
              disabled={isSendDisabled}
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Send message"
            >
              <SendHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

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
