import { MdCached, MdCheckCircle, MdClose, MdError } from "react-icons/md";
import { Form } from "@remix-run/react";

export const NumbersTable = ({ phoneNumbers, users = [] }) => {
  const owners = users.filter((user) => user.user_workspace_role === "owner");
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
            </tr>
          </thead>
          <tbody>
            {phoneNumbers?.map((number) => (
              <NumberRow
                key={number.id}
                number={number}
                owners={owners}
                verifiedNumbers={verifiedNumbers}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const NumberRow = ({ number, owners, verifiedNumbers }) => {
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
          <button type="submit">
            <MdClose />
          </button>
        </Form>
      </td>
      <td className="px-2 py-2 text-left font-semibold">
        {number.friendly_name}
      </td>
      <td className="px-2 py-2">{number.phone_number}</td>
      <td className="py-2">
        <StatusIndicator status={number.capabilities.verification_status} />
      </td>
      <td className="px-2 py-2">
        {number.type === "caller_id" ? (
          <Form>
            <select disabled className="w-full">
              <option>Outbound Only</option>
            </select>
          </Form>
        ) : (
          <Form>
            <select className="w-full">
              {owners.map((owner) => (
                <option key={owner.id}>
                  Email to Account Owner {owner && `- ${owner.username}`}
                </option>
              ))}
              {verifiedNumbers.map((number) => (
                <option key={number.id}>Forward to {number.friendly_name}</option>
              ))}
            </select>
          </Form>
        )}
      </td>
    </tr>
  );
};

const StatusIndicator = ({ status }) => {
  switch (status) {
    case "success":
      return (
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase">Active</p>
          <MdCheckCircle fill="#008800" size={24} />
        </div>
      );
    case "failed":
      return (
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase">{status}</p>
          <MdError fill="#880000" size={24} />
        </div>
      );
    case "pending":
      return (
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase">{status}</p>
          <MdCached size={24} />
        </div>
      );
    default:
      return null;
  }
};