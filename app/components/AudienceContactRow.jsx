import { MdEdit, MdRemoveCircleOutline } from "react-icons/md";
import { Button } from "./ui/button";
import { NavLink } from "react-router-dom";

export const AudienceContactRow = ({ contact, otherDataHeaders, handleRemoveContact }) => {
  return (
    <tr id={contact.id} className="text-gray-400">
      <td className="whitespace-nowrap px-2 py-1 text-sm">{contact.id}</td>
      <td className="whitespace-nowrap px-2 py-1 text-sm">{contact.external_id}</td>
      <td className="whitespace-nowrap px-2 py-1 text-sm">{contact.firstname}</td>
      <td className="whitespace-nowrap px-2 py-1 text-sm">{contact.surname}</td>
      <td className="whitespace-nowrap px-2 py-1 text-sm">{contact.phone}</td>
      <td className="whitespace-nowrap px-2 py-1 text-sm">{contact.email}</td>
      <td className="whitespace-nowrap px-2 py-1 text-sm">{contact.address}</td>
      <td className="whitespace-nowrap px-2 py-1 text-sm">{contact.city}</td>
      <td className="whitespace-nowrap px-2 py-1 text-sm">{contact.created_at ? (
        <>
          {new Date(contact.created_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
          <br />
          {new Date(contact.created_at).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: 'numeric',
          })}
        </>
      ) : ''}</td>
      {otherDataHeaders.map((header) => (
        <td key={header} className="whitespace-nowrap px-2 py-1 text-sm">
          {contact.other_data.find((data) => data[header] !== undefined)?.[header] || ""}
        </td>
      ))}
      <td className="whitespace-nowrap px-2 py-1 ">
        <div className="flex justify-center">
          <Button variant={"ghost"} onClick={() => handleRemoveContact(contact.id)}>
            <MdRemoveCircleOutline />
          </Button>
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-1 ">
        <div className="flex justify-center">
          <Button variant={"ghost"} asChild>
            <NavLink to={`../../contacts/${contact.id}`} relative="path">
            <MdEdit />
            </NavLink>
          </Button>
        </div>
      </td>
    </tr>
  )
};