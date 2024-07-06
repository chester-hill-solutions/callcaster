import { AudienceContactRow } from "./AudienceContactRow";
import { ContactForm } from "./ContactForm";

const ContactTable = ({
  contacts,
  audience_id,
  newContact,
  handleInputChange,
  handleSaveContact,
  workspace_id,
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
      <thead className="overflow-x-scroll relative">
        <tr className=" sticky top-0 bg-primary">
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap">
            ID
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap">
            External ID
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap">
            First Name
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap">
            Last Name
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap">
            Phone
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap">
            Email
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap">
            Address
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap">
            City
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap">
            Date Created
          </th>
          {otherDataHeaders.map((header) => (
            <th
              key={header}
              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 ">
        {contacts.map((contact) => (
          <AudienceContactRow {...{ contact, otherDataHeaders }} key={contact.id} />
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
