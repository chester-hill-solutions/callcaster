import { Form } from "@remix-run/react";
import { Button } from "./ui/button";

const ContactForm = ({
  newContact,
  handleInputChange,
  handleSaveContact,
  workspace_id,
  audience_id,
}) => (
  <Form
    onSubmit={handleSaveContact}
    action="/api/contacts"
    method="POST"
    navigate={false}
    encType="application/x-www-form-urlencoded"
  >
    <div className="flex space-x-2">
      <input
        type="text"
        name="name"
        placeholder="Full Name"
        value={newContact.name}
        onChange={handleInputChange}
        className="w-full px-2 py-1"
      />
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
      <Button type="submit" className="ml-2">
        SAVE
      </Button>
    </div>
  </Form>
);

export { ContactForm };
