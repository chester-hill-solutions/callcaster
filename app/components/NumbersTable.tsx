import { MdCached, MdCheckCircle, MdClose, MdError } from "react-icons/md";
import { Form } from "@remix-run/react";
import { useState } from "react";
import { CheckCircleIcon, Edit } from "lucide-react";
import { Button } from "./ui/button";
import { User, WorkspaceNumbers } from "~/lib/types";

export const NumbersTable = ({
  phoneNumbers,
  users = [],
  mediaNames = [],
  onIncomingActivityChange,
  onIncomingVoiceMessageChange,
  onCallerIdChange,
}:{
  phoneNumbers: WorkspaceNumbers[],
  users: User[],
  mediaNames: string[],
}) => {
  console.log(phoneNumbers)
  const verifiedNumbers = phoneNumbers.filter(
    (number) => number.type === "caller_id",
  );

  return (
    <div className="m-4 flex w-fit flex-auto flex-col gap-4 rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white">
      <h3 className="text-center font-Zilla-Slab text-4xl font-bold">
        Existing Numbers
      </h3>
      <div className="flex flex-col py-4">
        <table className="w-full table-auto">
          <thead>
            <tr>
              <th className="py-2"></th>
              <th className="py-2 text-left">Caller ID</th>
              <th className="py-2 text-left">Phone Number</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-left">Incoming Activity</th>
              <th className="py-2 text-left">Incoming Voice Message</th>
            </tr>
          </thead>
          <tbody>
            {phoneNumbers?.map((number) => (
              <NumberRow
                key={number.id}
                number={number}
                members={users}
                verifiedNumbers={verifiedNumbers}
                mediaNames={mediaNames}
                handleIncomingActivityChange={onIncomingActivityChange}
                handleIncomingVoiceMessageChange={onIncomingVoiceMessageChange}
                handleCallerIdChange={onCallerIdChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
}: {
  number: WorkspaceNumbers;
  members: User[];
  verifiedNumbers: WorkspaceNumbers[];
  mediaNames: string[];
  handleIncomingActivityChange: (activity: string) => void;
  handleIncomingVoiceMessageChange: (activity: string) => void;
  handleCallerIdChange: (number: number, name: string) => void;
}) => {
  const [isEditingNumber, setIsEditingNumber] = useState<number | null>(null);
  const [callerId, setCallerId] = useState(number?.friendly_name || "");

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleCallerIdChange(number.id, callerId);
      setIsEditingNumber(null); // Exit edit mode
    } else if (e.key === "Escape") {
      setCallerId(number.friendly_name || ""); // Revert changes
      setIsEditingNumber(null); // Exit edit mode
    }
  };

  if (!number) return <>No Number found</>;
  return (
    <tr className="border-b dark:border-gray-700">
      <td className="py-2">
        <Form method="DELETE" name="remove-number">
          <input type="hidden" name="formName" value="remove-number" />
          <input
            name="numberId"
            hidden
            value={number.id}
            readOnly
            id="numberId"
          />
          <button type="submit" className="text-red-500 hover:text-red-700">
            <MdClose />
          </button>
        </Form>
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
                variant={"ghost"}
                className="rounded-full"
                onClick={() => handleCallerIdChange(number.id, callerId)}
              >
                <CheckCircleIcon />
              </Button>
            </>
          ) : (
            <>
              <p className="font-semibold">{number.friendly_name}</p>
              <Button
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
        <StatusIndicator status={number.capabilities?.verification_status} />
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

const StatusIndicator = ({ status }) => {
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
}:{
  number: WorkspaceNumbers;
  members: User[],
  verifiedNumbers:WorkspaceNumbers[],
  onChange: (id: number, value: string) => void;
}) => {
  return number && (
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
          {members.map((member:User) => member && (
            <option key={member.id} value={member.username}>
              Email to Workspace Member {member.username && `- ${member.username}`}
            </option>
          ))}
          {!verifiedNumbers.length && (
            <option disabled>
              Forward to your verified number
            </option>
          )}
          {verifiedNumbers.length > 0 && verifiedNumbers.map((verifiedNumber) => (
            <option
              key={verifiedNumber.id}
              value={`forward_${verifiedNumber.id}`}
            >
              Forward to {verifiedNumber.friendly_name}
            </option>
          ))}
        </>
      )}
    </select>
  );
};

const IncomingVoiceMessageSelect = ({ number, mediaNames, onChange }) => {
  return (
    <select
      className="w-full rounded border p-2"
      defaultValue={number.inbound_audio}
      onChange={(e) => onChange(number.id, e.target.value)}
    >
      <option value="">Select a voice message</option>
      {mediaNames.map((mediaName, index) => (
        <option key={index} value={mediaName.name}>
          {mediaName.name}
        </option>
      ))}
    </select>
  );
};

export default NumbersTable;
