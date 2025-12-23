import React from "react";
<<<<<<< HEAD:app/components/contact/ContactDetailsFields.tsx
import { TextInput } from "@/components/forms/Inputs";
=======
import { TextInput } from "./Inputs";
import type { Contact } from "~/lib/types";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/ContactDetailsFields.tsx

// Enhanced type definitions
export interface ContactFieldsProps {
  contact?: Contact | null;
  editMode: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export interface ContactField {
  label: string;
  name: keyof Contact;
  type?: string;
  placeholder?: string;
  required?: boolean;
}

const ContactFields: React.FC<ContactFieldsProps> = ({ 
  contact, 
  editMode, 
  onInputChange 
}) => {
  const fields: ContactField[] = [
    { label: "First Name", name: "firstname", placeholder: "Enter first name" },
    { label: "Last Name", name: "surname", placeholder: "Enter last name" },
    { label: "Phone", name: "phone", type: "tel", placeholder: "Enter phone number" },
    { label: "Email", name: "email", type: "email", placeholder: "Enter email address" },
    { label: "Address", name: "address", placeholder: "Enter street address" },
    { label: "City", name: "city", placeholder: "Enter city" },
    { label: "Province", name: "province", placeholder: "Enter province/state" },
    { label: "Postal Code", name: "postal", placeholder: "Enter postal code" },
  ];

  // Helper function to safely get field value
  const getFieldValue = (fieldName: keyof Contact): string => {
    try {
      if (!contact) return '';
      const value = contact[fieldName];
      return value != null ? String(value) : '';
    } catch (error) {
      console.error(`Error getting field value for ${String(fieldName)}:`, error);
      return '';
    }
  };

  // Helper function to safely get field type
  const getFieldType = (field: ContactField): string => {
    try {
      return field.type || 'text';
    } catch (error) {
      console.error('Error getting field type:', error);
      return 'text';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map((field) => (
        <div key={field.name} className="w-full">
          <TextInput
            label={field.label}
            id={field.name}
            name={field.name}
            type={getFieldType(field)}
            value={getFieldValue(field.name)}
            placeholder={field.placeholder}
            onChange={onInputChange}
            disabled={!editMode}
            required={field.required}
            className="w-full"
          />
        </div>
      ))}
    </div>
  );
};

export default ContactFields;