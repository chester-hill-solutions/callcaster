import { useState } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "~/components/ui/card";
import { TextInput } from "./Inputs";
import { Button } from "~/components/ui/button";
import { FaEdit, FaSave, FaPlus, FaTrash } from "react-icons/fa";
import RecentContacts from "./RecentContacts";

const ContactDetails = ({ contact, onSave, setContact, audiences, contactAudiences }) => {
  const [editMode, setEditMode] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleSave = () => {
    onSave(contact);
    setEditMode(false);
  };

  const handleInputChange = (e) => {
    setContact({
      ...contact,
      [e.target.name]: e.target.value,
    });
  };

  const handleOtherDataChange = (index, key, value) => {
    const newOtherData = [...contact.other_data];
    newOtherData[index] = { [key]: value };
    setContact({ ...contact, other_data: newOtherData });
  };

  const addNewOtherData = () => {
    if (newKey && newValue) {
      setContact({
        ...contact,
        other_data: [...contact.other_data, { [newKey]: newValue }],
      });
      setNewKey("");
      setNewValue("");
    }
  };

  const removeOtherData = (index) => {
    const newOtherData = contact.other_data.filter((_, i) => i !== index);
    setContact({ ...contact, other_data: newOtherData });
  };

  const ContactDataField = ({label, value, name, handleInputChange}) => (
    <div className="mb-4 min-w-[150px] sm:min-w-[300px]" style={{ flex: "1 1 40%"}}>
      <TextInput
        label={label}
        id={name}
        name={name}
        value={value || ""}
        onChange={handleInputChange}
        disabled={!editMode}
        className="flex w-full flex-col"
      />
    </div>
  );

  const ContactOtherFields = ({contact, editMode}) => (
    <div className="mt-1">
      <h3 className="mb-1 text-xl font-semibold">Other Data</h3>
      <div className="">
        {contact.other_data.map((item, index) => {
          const key = Object.keys(item)[0];
          const value = item[key];
          return (
            <div key={index} className="mb-2 flex items-end">
              <TextInput
                label={key}
                value={value}
                onChange={(e) =>
                  handleOtherDataChange(index, key, e.target.value)
                }
                disabled={!editMode}
                className="mr-2 flex flex-grow flex-col"
              />
              {editMode && (
                <Button
                  onClick={() => removeOtherData(index)}
                  className="bg-red-500 text-white hover:bg-red-600"
                >
                  <FaTrash />
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {editMode && (
        <div className="mt-4 flex items-end">
          <TextInput
            label="New Key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="mr-2 flex flex-grow flex-col"
            placeholder=""
            disabled={false}
          />
          <TextInput
            label="New Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="mr-2 flex flex-grow flex-col"
            placeholder=""
            disabled={false}
          />
          <Button
            onClick={addNewOtherData}
            className="bg-green-500 text-white hover:bg-green-600"
          >
            <FaPlus />
          </Button>
        </div>
      )}
    </div>
  );


  return (
    <Card className="mx-auto w-full max-w-4xl">
      <CardHeader>
        <h2 className="text-2xl font-bold">Contact Details</h2>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <ContactDataField handleInputChange={handleInputChange} label={"First Name"} value={contact.firstname} name={"firstname"}/>
          <ContactDataField handleInputChange={handleInputChange} label={"Last Name"} value={contact.surname} name={"lastname"}/>
          <ContactDataField handleInputChange={handleInputChange} label={"Phone"} value={contact.phone} name={"phone"}/>
          <ContactDataField handleInputChange={handleInputChange} label={"Email"} value={contact.email} name={"email"}/>
          <ContactDataField handleInputChange={handleInputChange} label={"Street Address"} value={contact.address} name={"address"}/>
          <ContactDataField handleInputChange={handleInputChange} label={"City"} value={contact.city} name={"city"}/>
          <ContactDataField handleInputChange={handleInputChange} label={"Province"} value={contact.province} name={"province"}/>
          <ContactDataField handleInputChange={handleInputChange} label={"Postal"} value={contact.postal} name={"postal"}/>
        </div>
        <div className="flex flex-col">
          
        </div>
        <ContactOtherFields contact={contact} editMode={editMode}/>
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
