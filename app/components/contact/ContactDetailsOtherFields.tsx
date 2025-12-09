import React, { useState } from "react";
import { TextInput } from "~/components/forms/Inputs";
import { Button } from "~/components/ui/button";
import { FaPlus, FaTrash } from "react-icons/fa";

type ContactUpdate = {
  other_data?: Array<{[x: string | number]: string}>;
  [key: string]: unknown;
};

const OtherDataFields = ({ otherData, editMode, setContact }:{
  otherData?: Array<{[x: string | number]: string}>;
  editMode: boolean;
  setContact: (contact: ContactUpdate | ((prevContact: ContactUpdate) => ContactUpdate)) => void;
}) => {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleOtherDataChange = (index: number, key: string, value: string) => {
    const newOtherData = [...otherData];
    newOtherData[index] = { [key]: value };
    setContact(prevContact => ({ ...prevContact, other_data: newOtherData }));
  };

  const addNewOtherData = () => {
    if (newKey && newValue) {
      setContact(prevContact => ({
        ...prevContact,
        other_data: [...prevContact.other_data, { [newKey]: newValue }],
      }));
      setNewKey("");
      setNewValue("");
    }
  };

  const removeOtherData = (index: number) => {
    setContact(prevContact => ({
      ...prevContact,
      other_data: prevContact.other_data.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="mt-1">
      <h3 className="mb-1 text-xl font-semibold">Other Data</h3>
      <div>
        {otherData?.map((item, index) => {
          const key = Object.keys(item)[0];
          const value = item[key];
          return (
            <div key={index} className="mb-2 flex items-end">
              <TextInput
                label={key}
                value={value}
                onChange={(e) => handleOtherDataChange(index, key, e.target.value)}
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
};

export default OtherDataFields;