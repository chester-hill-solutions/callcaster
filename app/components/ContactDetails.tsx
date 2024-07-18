import React, { useState } from "react";
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

const ContactDetails = ({ contact, onSave, setContact }) => {
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

  const renderField = (label, value, name) => (
    <div className="mb-4" style={{ flex: "1 1 40%", minWidth: "300px" }}>
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

  const renderOtherDataFields = () => (
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
          />
          <TextInput
            label="New Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="mr-2 flex flex-grow flex-col"
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

  const renderRecentContacts = () => {
    const recentContacts = contact.outreach_attempt.slice(-5).reverse();
    return (
      <div className="mt-6">
        <h3 className="mb-4 text-xl font-semibold">Recent Contacts</h3>
        {recentContacts.map((attempt, index) => (
          <Card key={index} className="mb-4 bg-gray-50 dark:bg-gray-800">
            <CardContent className="pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Date: {new Date(attempt.created_at).toLocaleDateString()}
              </p>
              <p className="text-sm font-medium">
                Disposition: {attempt.disposition || "N/A"}
              </p>
              {attempt.result && Object.keys(attempt.result).length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-semibold">Results:</p>
                  <ul className="list-inside list-disc">
                    {Object.entries(attempt.result).map(([key, value]) => (
                      <li
                        key={key}
                        className="text-bold text-gray-600 dark:text-gray-400"
                      >
                        <span className="capitalize">
                          {key.replace("_", " ")}
                        </span>
                        :
                        <ul className="list-inside list list-disc">
                           {Object.entries(value || {}).map(
                            ([valKey, valVal]) => (
                              <li key={`${key}-${valKey}`}>
                                <span className="font-bold">{valKey}</span>-{" "}
                                {valVal}
                              </li>
                            ),
                          )}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <Card className="mx-auto w-full max-w-4xl">
      <CardHeader>
        <h2 className="text-2xl font-bold">Contact Details</h2>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {renderField("First Name", contact.firstname, "firstname")}
          {renderField("Last Name", contact.surname, "surname")}
          {renderField("Phone", contact.phone, "phone")}
          {renderField("Email", contact.email, "email")}
          {renderField("Address", contact.address, "address")}
          {renderField("City", contact.city, "city")}
          {renderField("Province", contact.province, "province")}
          {renderField("Postal Code", contact.postal, "postal")}
        </div>
        {renderOtherDataFields()}
        <RecentContacts contact={contact}/>
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
