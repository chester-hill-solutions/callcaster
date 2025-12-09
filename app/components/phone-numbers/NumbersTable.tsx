import { MdCached, MdCheckCircle, MdClose, MdError } from "react-icons/md";
import { Form } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import { CheckCircleIcon, Edit } from "lucide-react";
import { Button } from "~/components/ui/button";
import { User, WorkspaceNumbers } from "~/lib/types";

export const NumbersTable = ({
  phoneNumbers,
  users = [],
  mediaNames = [],
  onIncomingActivityChange,
  onIncomingVoiceMessageChange,
  onCallerIdChange,
  onNumberRemoval,
  isBusy,
}: {
  phoneNumbers: WorkspaceNumbers[];
  users: User[];
  mediaNames: { id: number; name: string; }[];
  onIncomingActivityChange: (id: number, value: string) => void;
  onIncomingVoiceMessageChange: (id: number, value: string) => void;
  onCallerIdChange: (id: number, value: string) => void;
  onNumberRemoval: (id: number) => void;
  isBusy: boolean;
}) => {
  const [numbers, setNumbers] = useState(phoneNumbers);

  useEffect(() => {

    setNumbers(phoneNumbers);
  }, [phoneNumbers]);

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
      <><h3 className="text-center font-Zilla-Slab text-4xl font-bold">
      Existing Numbers
    </h3><div className="flex flex-col py-4">
        <table className="w-full table-auto">
          <thead>
            <tr>
              <th className="py-2"></th>
              <th className="py-2 text-left">Caller ID</th>
              <th className="py-2 text-left">Phone Number</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-left">Handle Voicemail</th>
              <th className="py-2 text-left">Voicemail Message</th>
            </tr>
          </thead>
          <tbody>
            {numbers.map((number) => (
              <NumberRow
                key={number?.id}
                number={number}
                members={users}
                verifiedNumbers={verifiedNumbers}
                mediaNames={mediaNames}
                handleIncomingActivityChange={handleIncomingActivityChange}
                handleIncomingVoiceMessageChange={handleIncomingVoiceMessageChange}
                handleCallerIdChange={handleCallerIdChange}
                handleNumberRemoval={handleNumberRemoval}
                isBusy={isBusy} />
            ))}
          </tbody>
        </table>
      </div></>
  );
};

const NumberRow = ({
  number,
  members,
  verifiedNumbers,
  mediaNames,
  handleIncomingActivityChange,
  handleIncomingVoiceMessageChange,
  handleCallerIdChange,
  handleNumberRemoval,
  isBusy,
}: {
  number: WorkspaceNumbers;
  members: User[];
  verifiedNumbers: WorkspaceNumbers[];
  mediaNames: { id: number; name: string; }[];
  handleIncomingActivityChange: (id: number, value: string) => void;
  handleIncomingVoiceMessageChange: (id: number, value: string) => void;
  handleCallerIdChange: (number: number, name: string) => void;
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
    <tr className="border-b dark:border-gray-700">
      <td className="mt-2 py-2">
        <Button
        variant={"ghost"}
          className="text-red-500 hover:text-red-700"
          onClick={() => handleNumberRemoval(number.id)}
          disabled={isBusy}
        >
          <MdClose />
        </Button>
      </td>
      <td className="px-2 py-2 text-left ">
        <div className="flex items-center gap-4">
          {isEditingNumber ? (
            <>
              <input
                name="callerId"
                id="callerId"
                value={callerId}
                onKeyDown={handleKeyPress}
                onChange={(e) => setCallerId(e.target.value)}
                type="text"
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
      </td>
      <td className="px-2 py-2">{number.phone_number}</td>
      <td className="py-2">
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
      </td>
      <td className="px-2 py-2">
        <IncomingActivitySelect
          number={number}
          members={members}
          verifiedNumbers={verifiedNumbers}
          onChange={handleIncomingActivityChange}
        />
      </td>
      <td className="px-2 py-2">
        <IncomingVoiceMessageSelect
          number={number}
          mediaNames={mediaNames}
          onChange={handleIncomingVoiceMessageChange}
        />
      </td>
    </tr>
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
          <p className="text-xs uppercase text-red-600">{status}</p>
          <MdError className="text-red-600" size={24} />
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
  members: User[];
  verifiedNumbers: WorkspaceNumbers[];
  onChange: (id: number, value: string) => void;
}) => {
  return (
    number && (
      <select
        className="w-full rounded border p-2"
        disabled={number.type === "caller_id"}
        defaultValue={number.inbound_action || ""}
        onChange={(e) => onChange(number.id, e.target.value)}
      >
        {number.type === "caller_id" ? (
          <option>Outbound Only</option>
        ) : (
          <>
            <option value="">Select how to handle incoming calls</option>
            <option value="webhook_only">Webhook Only</option>
            {members.map(
              (member: User) =>
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
    )
  );
};

const IncomingVoiceMessageSelect = ({ number, mediaNames, onChange }: { number: WorkspaceNumbers, mediaNames: { id: number; name: string; }[], onChange: (id: number, value: string) => void }) => {
  if (!number) return null;
  return (
    <select
      className="w-full rounded border p-2"
      defaultValue={number?.inbound_audio || ""}
      onChange={(e) => onChange(number?.id, e.target.value)}
    >
      <option value="">Select a voice message</option>
      {mediaNames.filter(mediaName => !mediaName.name.startsWith('voicemail-+')).map((mediaName: { id: number, name: string }, index: number) => (
        <option key={index} value={mediaName.id}>
          {mediaName.name}
        </option>
      ))}
    </select>
  );
};

export default NumbersTable;
