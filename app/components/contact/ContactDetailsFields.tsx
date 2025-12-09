import React from "react";
import { TextInput } from "@/components/forms/Inputs";

const ContactFields = ({ contact, editMode, onInputChange }) => {
  const fields = [
    { label: "First Name", name: "firstname" },
    { label: "Last Name", name: "surname" },
    { label: "Phone", name: "phone" },
    { label: "Email", name: "email" },
    { label: "Address", name: "address" },
    { label: "City", name: "city" },
    { label: "Province", name: "province" },
    { label: "Postal Code", name: "postal" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {fields.map(({ label, name }) => (
        <div key={name} className="mb-4" style={{ flex: "1 1 40%", minWidth: "300px" }}>
          <TextInput
            label={label}
            id={name}
            name={name}
            value={contact ? (contact[name] || "") : ""}
            onChange={onInputChange}
            disabled={!editMode}
            className="flex w-full flex-col"
          />
        </div>
      ))}
    </div>
  );
};

export default ContactFields;