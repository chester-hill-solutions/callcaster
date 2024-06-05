
export const AudienceContactRow = ({ contact }) => (
    <tr id={contact.id}>
        <td className="whitespace-nowrap px-2 py-1 text-sm">
            {contact.firstname} {contact.surname}
        </td>
        <td className="whitespace-nowrap px-2 py-1 text-sm">
            {contact.phone}
        </td>
        <td className="whitespace-nowrap px-2 py-1 text-sm">
            {contact.email}
        </td>
        <td className="whitespace-nowrap px-2 py-1 text-sm">
            {contact.address}
        </td>
    </tr>)