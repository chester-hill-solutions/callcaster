import { Form } from "@remix-run/react";
import { Button } from "@/components/ui/button";

const ContactForm = ({
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
    <input hidden name="id" value={newContact.id} type="hidden"/>
    <div className="flex space-x-2">
      <input
        type="text"
        name="firstname"
        placeholder="First Name"
        value={newContact.firstname}
        onChange={handleInputChange}
        className="w-full px-2 py-1"
      />
      <input
        type="text"
        name="surname"
        placeholder="Last Name"
        value={newContact.surname}
        onChange={handleInputChange}
        className="w-full px-2 py-1"
      />
    </div>
    <div className="flex space-x-2">
      <input
        type="tel"
        name="phone"
        placeholder="Phone Number"
        value={newContact.phone}
        onChange={handleInputChange}
        className="w-full px-2 py-1"
      />
      <input
        type="email"
        name="email"
        placeholder="Email Address"
        value={newContact.email}
        onChange={handleInputChange}
        className="w-full px-2 py-1"
      />
    </div>
    <input
      type="text"
      name="address"
      placeholder="Street Address"
      value={newContact.address}
      onChange={handleInputChange}
      className="w-full px-2 py-1"
    />
    <input hidden name="workspace" value={workspace_id} readOnly />
    <input hidden name="audience_id" value={audience_id} readOnly />
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
