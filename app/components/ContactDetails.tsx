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

const ContactDetails = ({ contact, onSave }) => {
  const [editMode, setEditMode] = useState(false);
  const [editedContact, setEditedContact] = useState(contact);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleSave = () => {
    onSave(editedContact);
    setEditMode(false);
  };

  const handleInputChange = (e) => {
    setEditedContact({
      ...editedContact,
      [e.target.name]: e.target.value,
    });
  };

  const handleOtherDataChange = (index, key, value) => {
    const newOtherData = [...editedContact.other_data];
    newOtherData[index] = { [key]: value };
    setEditedContact({ ...editedContact, other_data: newOtherData });
  };

  const addNewOtherData = () => {
    if (newKey && newValue) {
      setEditedContact({
        ...editedContact,
        other_data: [...editedContact.other_data, { [newKey]: newValue }],
      });
      setNewKey("");
      setNewValue("");
    }
  };

  const removeOtherData = (index) => {
    const newOtherData = editedContact.other_data.filter((_, i) => i !== index);
    setEditedContact({ ...editedContact, other_data: newOtherData });
  };

  const renderField = (label, value, name) => (
    <div className="mb-4">
      <TextInput
        label={label}
        id={name}
        name={name}
        value={value || ""}
        onChange={handleInputChange}
        disabled={!editMode}
        className="w-full flex flex-col"
      />
    </div>
  );

  const renderOtherDataFields = () => (
    <div className="mt-6">
      <h3 className="text-xl font-semibold mb-4">Other Data</h3>
      {editedContact.other_data.map((item, index) => {
        const key = Object.keys(item)[0];
        const value = item[key];
        return (
          <div key={index} className="flex items-center mb-2">
            <TextInput
              label={key}
              value={value}
              onChange={(e) => handleOtherDataChange(index, key, e.target.value)}
              disabled={!editMode}
              className="flex-grow flex flex-col"
            />
            {editMode && (
              <Button
                onClick={() => removeOtherData(index)}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                <FaTrash />
              </Button>
            )}
          </div>
        );
      })}
      {editMode && (
        <div className="flex items-end mt-4">
          <TextInput
            label="New Key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="flex-grow mr-2"
          />
          <TextInput
            label="New Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="flex-grow mr-2"
          />
          <Button
            onClick={addNewOtherData}
            className="bg-green-500 hover:bg-green-600 text-white"
          >
            <FaPlus />
          </Button>
        </div>
      )}
    </div>
  );

  const renderRecentContacts = () => {
    const recentContacts = editedContact.outreach_attempt.slice(-5).reverse();
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
                      <li key={key} className="text-sm text-gray-600 dark:text-gray-400">
                        {key}: {JSON.stringify(value)}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderField("First Name", editedContact.firstname, "firstname")}
          {renderField("Last Name", editedContact.surname, "surname")}
          {renderField("Phone", editedContact.phone, "phone")}
          {renderField("Email", editedContact.email, "email")}
          {renderField("Address", editedContact.address, "address")}
          {renderField("City", editedContact.city, "city")}
          {renderField("Province", editedContact.province, "province")}
          {renderField("Postal Code", editedContact.postal, "postal")}
        </div>
        {renderOtherDataFields()}
        {renderRecentContacts()}
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