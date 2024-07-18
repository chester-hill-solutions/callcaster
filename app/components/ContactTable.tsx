import { AudienceContactRow } from "./AudienceContactRow";
import { ContactForm } from "./ContactForm";

const ContactTable = ({
  contacts,
  audience_id,
  newContact,
  handleInputChange,
  handleSaveContact,
  workspace_id,
  handleRemoveContact,
}) => {
  const otherDataHeaders = Array.from(
    new Set(
      contacts.flatMap((contact) =>
        contact.other_data.flatMap((data) => Object.keys(data)),
      ),
    ),
  );

  return (
    <table className="divide-y divide-gray-200">
      <thead className="relative overflow-x-scroll">
        <tr className=" sticky top-0 bg-primary">
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            ID
          </th>
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            External ID
          </th>
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            First Name
          </th>
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            Last Name
          </th>
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            Phone
          </th>
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            Email
          </th>
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            Address
          </th>
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            City
          </th>
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            Date Created
          </th>
          {otherDataHeaders.map((header) => (
            <th
              key={header}
              className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
            >
              {header}
            </th>
          ))}
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            Remove
          </th>
          <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            Edit
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 ">
        {contacts.map((contact) => (
          <AudienceContactRow
            {...{ contact, otherDataHeaders, handleRemoveContact }}
            key={contact.id}
          />
        ))}
        <tr hidden>
          <td colSpan={4}>
            <ContactForm
              newContact={newContact}
              handleInputChange={handleInputChange}
              handleSaveContact={handleSaveContact}
              workspace_id={workspace_id}
              audience_id={audience_id}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
};

export { ContactTable };
