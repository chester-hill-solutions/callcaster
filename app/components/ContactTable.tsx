import { AudienceContactRow } from "./AudienceContactRow";
import { ContactForm } from "./ContactForm";

const ContactTable = ({ contacts, audience_id, newContact, handleInputChange, handleSaveContact, workspace_id }) => {
    return (
    <table className="divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            Name
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            Phone
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            Email
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            Address
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white">
        {contacts.map((contact) => (
          <AudienceContactRow {...{ contact }} key={contact.id} />
        ))}
        <tr>
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
