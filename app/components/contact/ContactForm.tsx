import { Form } from "@remix-run/react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { Contact } from "@/lib/types";

// Enhanced type definitions
export interface ContactFormProps {
  isNew: boolean;
  newContact: Partial<Contact>;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSaveContact: (event: React.FormEvent<HTMLFormElement>) => void;
  workspace_id: string;
  audience_id: string | null;
}

export interface ContactFormData {
  id?: number;
  firstname?: string;
  surname?: string;
  phone?: string;
  email?: string;
  address?: string;
  workspace: string;
  audience_id: string | null;
}

const ContactForm: React.FC<ContactFormProps> = ({
  isNew,
  newContact,
  handleInputChange,
  handleSaveContact,
  workspace_id,
  audience_id,
}) => (
  <Form
    onSubmit={handleSaveContact}
    action="/api/contacts"
    method={isNew ? "POST" : "PATCH"}
    navigate={false}
    className="space-y-2"
  >
    <input hidden name="id" value={newContact.id || ''} type="hidden"/>
    <div className="flex space-x-2">
      <FormField htmlFor="firstname" label="First Name" className="w-full">
        <Input
          id="firstname"
          type="text"
          name="firstname"
          placeholder="First Name"
          value={newContact.firstname || ''}
          onChange={handleInputChange}
        />
      </FormField>
      <FormField htmlFor="surname" label="Last Name" className="w-full">
        <Input
          id="surname"
          type="text"
          name="surname"
          placeholder="Last Name"
          value={newContact.surname || ''}
          onChange={handleInputChange}
        />
      </FormField>
    </div>
    <div className="flex space-x-2">
      <FormField htmlFor="phone" label="Phone Number" className="w-full">
        <Input
          id="phone"
          type="tel"
          name="phone"
          placeholder="Phone Number"
          value={newContact.phone || ''}
          onChange={handleInputChange}
        />
      </FormField>
      <FormField htmlFor="email" label="Email Address" className="w-full">
        <Input
          id="email"
          type="email"
          name="email"
          placeholder="Email Address"
          value={newContact.email || ''}
          onChange={handleInputChange}
        />
      </FormField>
    </div>
    <FormField htmlFor="address" label="Street Address">
      <Input
        id="address"
        type="text"
        name="address"
        placeholder="Street Address"
        value={newContact.address || ''}
        onChange={handleInputChange}
      />
    </FormField>
    <input hidden name="workspace" value={workspace_id} readOnly />
    <input hidden name="audience_id" value={audience_id ?? ""} readOnly />
    <div className="flex flex-auto justify-end">
      <div>
        <Button type="submit" className="ml-2">
          SAVE
        </Button>
      </div>
    </div>
  </Form>
);

export { ContactForm };
