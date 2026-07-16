import { MdCached, MdCheckCircle, MdClose, MdError } from "react-icons/md";
import { Form, Link } from "react-router";
import { useState, useCallback } from "react";
import { CheckCircleIcon, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { User, WorkspaceNumbers } from "@/lib/types";

/** Minimal member shape this table consumes (User rows or workspace-user rows). */
type MemberOption = Pick<NonNullable<User>, "id" | "username"> | null;
import {
  INBOUND_RING_COUNT_OPTIONS,
  normalizeInboundRingCount,
} from "../../../shared/inbound-rings";

export const NumbersTable = ({
  phoneNumbers,
  users = [],
  mediaNames = [],
  queues = [],
  scripts = [],
  onIncomingActivityChange,
  onIncomingVoiceMessageChange,
  onCallerIdChange,
  onHandsetChange,
  onInboundRingCountChange,
  onInboundQueueChange,
  onInboundScriptChange,
  onNumberRemoval,
  isBusy,
  title = "Existing Numbers",
  hideEmptyState = false,
}: {
  phoneNumbers: WorkspaceNumbers[];
  users: MemberOption[];
  mediaNames: { id: number | string; name: string }[];
  queues?: { id: number; name: string }[];
  scripts?: { id: number; name: string }[];
  onIncomingActivityChange: (id: number, value: string) => void;
  onIncomingVoiceMessageChange: (id: number, value: string) => void;
  onCallerIdChange: (id: number, value: string) => void;
  onHandsetChange?: (numberId: number, enabled: boolean) => void;
  onInboundRingCountChange?: (numberId: number, value: string) => void;
  onInboundQueueChange?: (numberId: number, queueId: string) => void;
  onInboundScriptChange?: (numberId: number, scriptId: string) => void;
  onNumberRemoval: (id: number) => void;
  isBusy: boolean;
  /** Reuse hook for embedding this table outside the numbers settings page (e.g. onboarding). */
  title?: string;
  /** Reuse hook: suppress the "No phone numbers yet" empty state when the caller already gates rendering on having numbers. */
  hideEmptyState?: boolean;
}) => {
  const [numbers, setNumbers] = useState(phoneNumbers);

  const [prevPhoneNumbers, setPrevPhoneNumbers] = useState(phoneNumbers);
  if (prevPhoneNumbers !== phoneNumbers) {
    setPrevPhoneNumbers(phoneNumbers);
    setNumbers(phoneNumbers);
  }

  const updateNumber = useCallback(
    (id: number, updates: Partial<WorkspaceNumbers>) => {
      setNumbers((prevNumbers: WorkspaceNumbers[]) =>
        prevNumbers.map((number) =>
          number?.id === id ? { ...number, ...updates } as WorkspaceNumbers : number
        )
      );
    },
    []
  );

  const handleIncomingActivityChange = useCallback(
    (numberId: number, value: string) => {
      updateNumber(numberId, { inbound_action: value });
      onIncomingActivityChange(numberId, value);
    },
    [updateNumber, onIncomingActivityChange],
  );

  const handleIncomingVoiceMessageChange = useCallback(
    (numberId: number, value: string) => {
      updateNumber(numberId, { inbound_audio: value });
      onIncomingVoiceMessageChange(numberId, value);
    },
    [updateNumber, onIncomingVoiceMessageChange],
  );

  const handleCallerIdChange = useCallback(
    (numberId: number, value: string) => {
      updateNumber(numberId, { friendly_name: value });
      onCallerIdChange(numberId, value);
    },
    [updateNumber, onCallerIdChange],
  );

  const handleHandsetChange = useCallback(
    (numberId: number, enabled: boolean) => {
      updateNumber(numberId, { handset_enabled: enabled });
      onHandsetChange?.(numberId, enabled);
    },
    [updateNumber, onHandsetChange],
  );

  const handleInboundRingCountChange = useCallback(
    (numberId: number, value: string) => {
      const ringCount = normalizeInboundRingCount(value);
      updateNumber(numberId, { inbound_ring_count: ringCount });
      onInboundRingCountChange?.(numberId, String(ringCount));
    },
    [updateNumber, onInboundRingCountChange],
  );

  const handleInboundQueueChange = useCallback(
    (numberId: number, queueId: string) => {
      updateNumber(numberId, { inbound_queue_id: queueId ? Number(queueId) : undefined });
      onInboundQueueChange?.(numberId, queueId);
    },
    [updateNumber, onInboundQueueChange],
  );

  const handleNumberRemoval = useCallback(
    (numberId: number) => {
      setNumbers((prevNumbers: WorkspaceNumbers[]) =>
        prevNumbers.filter((number) => number?.id !== numberId),
      );
      onNumberRemoval(numberId);
    },
    [onNumberRemoval],
  );

  const verifiedNumbers = numbers.filter(
    (number) => number?.type === "caller_id",
  );

  return (
      <>
      <Heading as="h2" className="text-center" branded>
      {title}
    </Heading><div className="flex flex-col py-4">
        {numbers.length === 0 ? (
          hideEmptyState ? null :
          <div className="flex items-center justify-center py-8">
            <Card className="w-full max-w-md">
              <CardHeader className="items-center gap-2 text-center">
                <Heading as="h2" level={3} branded={false}>
                  No phone numbers yet
                </Heading>
                <Text variant="muted" className="max-w-sm">
                  Rent a number or verify a caller ID to start calling.
                </Text>
                <div className="flex justify-center pt-2">
                  <Button asChild>
                    <Link to="./purchase">Rent a Number</Link>
                  </Button>
                </div>
              </CardHeader>
            </Card>
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="py-2"></TableHead>
              <TableHead className="py-2 text-left">Caller ID</TableHead>
              <TableHead className="py-2 text-left">Phone Number</TableHead>
              <TableHead className="py-2 text-left">Status</TableHead>
              <TableHead className="py-2 text-left">Handset</TableHead>
              <TableHead className="py-2 text-left">Rings</TableHead>
              <TableHead className="py-2 text-left">Script</TableHead>
              <TableHead className="py-2 text-left">Queue</TableHead>
              <TableHead className="py-2 text-left">Handle Voicemail</TableHead>
              <TableHead className="py-2 text-left">Voicemail Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {numbers.map((number) => (
              <NumberRow
                key={number?.id}
                number={number}
                members={users}
                verifiedNumbers={verifiedNumbers}
                mediaNames={mediaNames}
                queues={queues}
                scripts={scripts}
                handleIncomingActivityChange={handleIncomingActivityChange}
                handleIncomingVoiceMessageChange={handleIncomingVoiceMessageChange}
                handleCallerIdChange={handleCallerIdChange}
                handleHandsetChange={handleHandsetChange}
                onInboundRingCountChange={handleInboundRingCountChange}
                onInboundQueueChange={handleInboundQueueChange}
                onInboundScriptChange={onInboundScriptChange}
                handleNumberRemoval={handleNumberRemoval}
                isBusy={isBusy} />
            ))}
          </TableBody>
        </Table>
        )}
      </div></>
  );
};

const NumberRow = ({
  number,
  members,
  verifiedNumbers,
  mediaNames,
  queues = [],
  scripts = [],
  handleIncomingActivityChange,
  handleIncomingVoiceMessageChange,
  handleCallerIdChange,
  handleHandsetChange,
  onInboundRingCountChange,
  onInboundQueueChange,
  onInboundScriptChange,
  handleNumberRemoval,
  isBusy,
}: {
  number: WorkspaceNumbers;
  members: MemberOption[];
  verifiedNumbers: WorkspaceNumbers[];
  mediaNames: { id: number | string; name: string }[];
  queues?: { id: number; name: string }[];
  scripts?: { id: number; name: string }[];
  handleIncomingActivityChange: (id: number, value: string) => void;
  handleIncomingVoiceMessageChange: (id: number, value: string) => void;
  handleCallerIdChange: (number: number, name: string) => void;
  handleHandsetChange?: (numberId: number, enabled: boolean) => void;
  onInboundRingCountChange?: (numberId: number, value: string) => void;
  onInboundQueueChange?: (numberId: number, queueId: string) => void;
  onInboundScriptChange?: (numberId: number, scriptId: string) => void;
  handleNumberRemoval: (numberId: number) => void;
  isBusy: boolean;
}) => {
  const [isEditingNumber, setIsEditingNumber] = useState<number | null>(null);
  const [callerId, setCallerId] = useState(number?.friendly_name || "");

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && number?.id) {
      handleCallerIdChange(number?.id, callerId);
      setIsEditingNumber(null);
    } else if (e.key === "Escape") {
      setCallerId(number?.friendly_name || "");
      setIsEditingNumber(null);
    }
  };

  if (!number) return <>No Number found</>;
  return (
    <TableRow>
      <TableCell className="mt-2 py-2">
        <Button
        variant={"ghost"}
          className="text-destructive hover:text-destructive/80"
          onClick={() => handleNumberRemoval(number.id)}
          disabled={isBusy}
        >
          <MdClose />
        </Button>
      </TableCell>
      <TableCell className="px-2 py-2 text-left ">
        <div className="flex items-center gap-4">
          {isEditingNumber ? (
            <>
              <Input
                name="callerId"
                id="callerId"
                value={callerId}
                onKeyDown={handleKeyPress}
                onChange={(e) => setCallerId(e.target.value)}
                type="text"
                className="max-w-xs"
              />
              <Button
                disabled={isBusy}
                variant={"ghost"}
                className="rounded-full"
                onClick={() => {
                  handleCallerIdChange(number.id, callerId);
                  setIsEditingNumber(null);
                }}
              >
                <CheckCircleIcon />
              </Button>
            </>
          ) : (
            <>
              <p className="font-semibold">{number.friendly_name}</p>
              <Button
                disabled={isBusy}
                variant={"ghost"}
                className="rounded-full"
                onClick={() => setIsEditingNumber(number.id)}
              >
                <Edit />
              </Button>
            </>
          )}
        </div>
      </TableCell>
      <TableCell className="px-2 py-2">{number.phone_number}</TableCell>
      <TableCell className="py-2">
        <StatusIndicator 
          status={
            typeof number?.capabilities === 'object' && 
            number.capabilities !== null &&
            'verification_status' in number.capabilities &&
            number.capabilities.verification_status !== undefined
              ? String(number.capabilities.verification_status) 
              : ''
          } 
        />
      </TableCell>
      <TableCell className="px-2 py-2">
        {handleHandsetChange && number.type !== "caller_id" && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(number?.handset_enabled)}
              disabled={isBusy}
              onChange={(e) => handleHandsetChange(number.id, e.target.checked)}
              className="h-4 w-4 rounded border-input"
              aria-label="Ring handset"
            />
            <span className="text-sm">Ring handset</span>
          </label>
        )}
      </TableCell>
      <TableCell className="px-2 py-2">
        {number.type !== "caller_id" ? (
          <select
            className="w-full rounded border p-2"
            disabled={isBusy}
            value={String(normalizeInboundRingCount(number.inbound_ring_count))}
            onChange={(event) =>
              onInboundRingCountChange?.(number.id, event.target.value)
            }
            aria-label={`Ring count for ${number.phone_number ?? "number"}`}
          >
            {INBOUND_RING_COUNT_OPTIONS.map((ringCount) => (
              <option key={ringCount} value={ringCount}>
                {ringCount} {ringCount === 1 ? "ring" : "rings"}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="px-2 py-2">
        {number.type !== "caller_id" && onInboundScriptChange ? (
          <select
            className="w-full rounded border p-2"
            disabled={isBusy}
            value={number.inbound_script_id ? String(number.inbound_script_id) : ""}
            onChange={(e) => onInboundScriptChange(number.id, e.target.value)}
            aria-label={`Inbound IVR script for ${number.phone_number ?? "number"}`}
          >
            <option value="">No script</option>
            {scripts.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="px-2 py-2">
        {number.type !== "caller_id" && onInboundQueueChange ? (
          <select
            className="w-full rounded border p-2"
            disabled={isBusy}
            value={number.inbound_queue_id ? String(number.inbound_queue_id) : ""}
            onChange={(e) => onInboundQueueChange(number.id, e.target.value)}
            aria-label={`Inbound queue for ${number.phone_number ?? "number"}`}
          >
            <option value="">No queue</option>
            {queues.map((q) => (
              <option key={q.id} value={String(q.id)}>
                {q.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="px-2 py-2">
        <IncomingActivitySelect
          number={number}
          members={members}
          verifiedNumbers={verifiedNumbers}
          onChange={handleIncomingActivityChange}
        />
      </TableCell>
      <TableCell className="px-2 py-2">
        <IncomingVoiceMessageSelect
          number={number}
          mediaNames={mediaNames}
          onChange={handleIncomingVoiceMessageChange}
        />
      </TableCell>
    </TableRow>
  );
};

const StatusIndicator = ({ status }: { status: string }) => {
  switch (status) {
    case "success":
      return (
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase text-green-600">Active</p>
          <MdCheckCircle className="text-green-600" size={24} />
        </div>
      );
    case "failed":
      return (
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase text-destructive">{status}</p>
          <MdError className="text-destructive" size={24} />
        </div>
      );
    case "pending":
      return (
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase text-yellow-600">{status}</p>
          <MdCached className="animate-spin text-yellow-600" size={24} />
        </div>
      );
    default:
      return null;
  }
};

const IncomingActivitySelect = ({
  number,
  members,
  verifiedNumbers,
  onChange,
}: {
  number: WorkspaceNumbers;
  members: MemberOption[];
  verifiedNumbers: WorkspaceNumbers[];
  onChange: (id: number, value: string) => void;
}) => {
  const forwardingDisabledReasonId = `forwarding-disabled-reason-${number?.id ?? "unknown"}`;
  const forwardingUnavailable =
    Boolean(number) && number?.type !== "caller_id" && verifiedNumbers.length === 0;

  return (
    number && (
      <div className="space-y-1">
        <select
          className="w-full rounded border p-2"
          disabled={number.type === "caller_id"}
          defaultValue={number.inbound_action || ""}
          onChange={(e) => onChange(number.id, e.target.value)}
          aria-describedby={
            forwardingUnavailable ? forwardingDisabledReasonId : undefined
          }
        >
          {number.type === "caller_id" ? (
            <option>Outbound Only</option>
          ) : (
            <>
              <option value="">Select how to handle incoming calls</option>
              <option value="webhook_only">Webhook Only</option>
              {members.map(
                (member: MemberOption) =>
                  member && (
                    <option key={member.id} value={member.username}>
                      Email to Workspace Member{" "}
                      {member.username && `- ${member.username}`}
                    </option>
                  ),
              )}
              {!verifiedNumbers.length && (
                <option disabled>Forward to your verified number</option>
              )}
              {verifiedNumbers.length > 0 &&
                verifiedNumbers.map((verifiedNumber) => (
                  <option
                    key={verifiedNumber?.id}
                    value={`${verifiedNumber?.phone_number}`}
                  >
                    Forward to {verifiedNumber?.friendly_name}
                  </option>
                ))}
            </>
          )}
        </select>
        {forwardingUnavailable ? (
          <p
            id={forwardingDisabledReasonId}
            className="text-xs text-muted-foreground"
            role="status"
          >
            Verify a caller ID before enabling call forwarding.
          </p>
        ) : null}
      </div>
    )
  );
};

const IncomingVoiceMessageSelect = ({ number, mediaNames, onChange }: { number: WorkspaceNumbers, mediaNames: { id: number | string; name: string; }[], onChange: (id: number, value: string) => void }) => {
  if (!number) return null;
  return (
    <select
      className="w-full rounded border p-2"
      defaultValue={number?.inbound_audio || ""}
      onChange={(e) => onChange(number?.id, e.target.value)}
    >
      <option value="">Select a voice message</option>
      {mediaNames.filter(mediaName => !mediaName.name.startsWith('voicemail-+')).map((mediaName: { id: number | string; name: string }, index: number) => (
        <option key={index} value={mediaName.name}>
          {mediaName.name}
        </option>
      ))}
    </select>
  );
};

export default NumbersTable;
