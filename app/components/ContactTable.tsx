import { AudienceContactRow } from "./AudienceContactRow";
import { ContactForm } from "./ContactForm";

const getUniqueKeys = (...arrays) => {
  const allObjects = arrays.flat();

  const otherDataKeys = allObjects.flatMap((obj) =>
    obj.other_data
      ? obj.other_data.flatMap((subObj) => Object.keys(subObj))
      : [],
  );

  const allKeys = [...otherDataKeys];
  return new Set(allKeys);
};
const ContactTable = ({
  contacts,
  audience_id,
  newContact,
  handleInputChange,
  handleSaveContact,
  workspace_id,
}) => {
  const other_column_keys = getUniqueKeys(contacts);
  return (
    <table className="divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          {[
            "ID",
            "External ID",
            "First Name",
            "Surname",
            "Phone",
            "Email",
            "Address",
            "City",
            "Postal",
          ].map((key) => (
            <th
              key={key}
              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
            >
              {key}
            </th>
          ))}

          {other_column_keys.size > 0 &&
            Array.from(other_column_keys).map((key) => (
              <th
                key={key}
                className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                {key}
              </th>
            ))}
        </tr>{" "}
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white">
        {contacts.map((contact) => (
          <AudienceContactRow {...{ contact, other_column_keys }} key={contact.id} />
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
