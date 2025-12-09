import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { FaEdit, FaSave } from "react-icons/fa";
import ContactFields from "./ContactDetailsFields";
import OtherDataFields from "./ContactDetailsOtherFields";
import RecentContacts from "./RecentContacts";
import { Audience, Contact, ContactAudience } from "~/lib/types";

const ContactDetails = ({
  contact,
  onSave,
  setContact,
  audiences,
  handleAudience,
}: {
  contact?: Contact & { contact_audience?: ContactAudience[] };
  onSave: () => void;
  setContact: (data: object) => void;
  handleAudience: (data: object) => void;
  audiences: Audience[];
}) => {
  const [editMode, setEditMode] = useState(false);

  const handleEdit = () => setEditMode(true);

  const handleSave = () => {
    onSave();
    setEditMode(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setContact({ ...contact, [name]: value });
  };

  return (
    <Card className="mx-auto w-full max-w-4xl">
      <CardHeader>
        <h2 className="text-2xl font-bold">Contact Details</h2>
      </CardHeader>
      <CardContent>
        <ContactFields
          contact={contact}
          editMode={editMode}
          onInputChange={handleInputChange}
        />
        <div className="my-2 flex flex-1 flex-col pb-4">
          <h3 className="mb-1 text-xl font-semibold">Audiences</h3>
          <div>
            {audiences.map((audience) => (
              <div className="flex gap-2" key={audience.id}>
                <input
                  type="checkbox"
                  value={audience.id}
                  checked={contact?.contact_audience?.some(
                    (contactAud) => contactAud.audience_id === audience.id
                  )}
                  name={audience.name}
                  id={audience.name}
                  onChange={handleAudience}
                  disabled={!editMode}
                />
                <label htmlFor={audience.name}>{audience.name}</label>
              </div>
            ))}
          </div>

        </div>
        <OtherDataFields
          otherData={contact?.other_data}
          editMode={editMode}
          setContact={setContact}
        />
        <RecentContacts contact={contact} />
      </CardContent>
      <CardFooter className="flex justify-end">
        {editMode ? (
          <Button
            onClick={handleSave}
            className="bg-green-500 text-white hover:bg-green-600"
          >
            <FaSave className="mr-2" /> Save
          </Button>
        ) : (
          <Button
            onClick={handleEdit}
            className="bg-blue-500 text-white hover:bg-blue-600"
          >
            <FaEdit className="mr-2" /> Edit
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default ContactDetails;
