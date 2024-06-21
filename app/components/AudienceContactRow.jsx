const cols = ["id", "external_id", "firstname", "surname", "phone", "email", "address", "city", "postal"];

export const AudienceContactRow = ({ contact, other_column_keys }) => (
    <tr id={contact.id} style={{ color: "#333" }}>
        {cols.map((key) => (
            <td key={key} className="whitespace-nowrap px-2 py-1 text-sm">
                {contact[key]}
            </td>
        ))}
        {Array.from(other_column_keys).map((key) => (
            <td key={key} className="whitespace-nowrap px-2 py-1 text-sm">
                {contact.other_data?.find(item => Object.keys(item)[0] === key)?.[key]}
            </td>
        ))}
    </tr>
);
