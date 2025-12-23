<<<<<<< HEAD:app/components/contact/ContactDetailsOtherFields.tsx
import React, { useState } from "react";
import { TextInput } from "@/components/forms/Inputs";
import { Button } from "@/components/ui/button";
=======
import React, { useState, useCallback } from "react";
import { TextInput } from "./Inputs";
import { Button } from "~/components/ui/button";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/ContactDetailsOtherFields.tsx
import { FaPlus, FaTrash } from "react-icons/fa";
import type { Json } from "~/lib/database.types";

<<<<<<< HEAD:app/components/contact/ContactDetailsOtherFields.tsx
type ContactUpdate = {
  other_data?: Array<{[x: string | number]: string}>;
  [key: string]: unknown;
};

const OtherDataFields = ({ otherData, editMode, setContact }:{
  otherData?: Array<{[x: string | number]: string}>;
  editMode: boolean;
  setContact: (contact: ContactUpdate | ((prevContact: ContactUpdate) => ContactUpdate)) => void;
=======
// Enhanced type definitions
export interface OtherDataFieldsProps {
  otherData?: Json[];
  editMode: boolean;
  setContact: (data: Record<string, unknown>) => void;
}

export interface OtherDataItem {
  [key: string]: unknown;
}

export interface OtherDataFieldsState {
  newKey: string;
  newValue: string;
}

const OtherDataFields: React.FC<OtherDataFieldsProps> = ({ 
  otherData, 
  editMode, 
  setContact 
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/ContactDetailsOtherFields.tsx
}) => {
  const [newKey, setNewKey] = useState<string>("");
  const [newValue, setNewValue] = useState<string>("");

<<<<<<< HEAD:app/components/contact/ContactDetailsOtherFields.tsx
  const handleOtherDataChange = (index: number, key: string, value: string) => {
    const newOtherData = [...otherData];
    newOtherData[index] = { [key]: value };
    setContact(prevContact => ({ ...prevContact, other_data: newOtherData }));
  };
=======
  // Enhanced handler with better type safety
  const handleOtherDataChange = useCallback((
    index: number, 
    key: string, 
    value: string
  ): void => {
    try {
      if (!otherData) return;
      
      const newOtherData = [...otherData];
      newOtherData[index] = { [key]: value };
      setContact({ other_data: newOtherData });
    } catch (error) {
      console.error('Error updating other data:', error);
    }
  }, [otherData, setContact]);
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/ContactDetailsOtherFields.tsx

  // Enhanced add function with validation
  const addNewOtherData = useCallback((): void => {
    try {
      if (!newKey.trim() || !newValue.trim()) {
        console.warn('Both key and value are required');
        return;
      }

      const newItem: OtherDataItem = { [newKey.trim()]: newValue.trim() };
      const updatedOtherData = [...(otherData || []), newItem];
      
      setContact({ other_data: updatedOtherData });
      setNewKey("");
      setNewValue("");
    } catch (error) {
      console.error('Error adding new other data:', error);
    }
  }, [newKey, newValue, otherData, setContact]);

<<<<<<< HEAD:app/components/contact/ContactDetailsOtherFields.tsx
  const removeOtherData = (index: number) => {
    setContact(prevContact => ({
      ...prevContact,
      other_data: prevContact.other_data.filter((_, i) => i !== index),
    }));
  };
=======
  // Enhanced remove function with validation
  const removeOtherData = useCallback((index: number): void => {
    try {
      if (!otherData || index < 0 || index >= otherData.length) {
        console.warn('Invalid index for removal');
        return;
      }

      const updatedOtherData = otherData.filter((_, i) => i !== index);
      setContact({ other_data: updatedOtherData });
    } catch (error) {
      console.error('Error removing other data:', error);
    }
  }, [otherData, setContact]);

  // Helper function to safely extract key-value pairs
  const getOtherDataItems = useCallback((): Array<{ key: string; value: string; index: number }> => {
    try {
      if (!otherData || !Array.isArray(otherData)) return [];

      return otherData
        .map((item, index) => {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const keys = Object.keys(item);
            if (keys.length > 0) {
              const key = keys[0];
              const value = item[key];
              return {
                key,
                value: value != null ? String(value) : '',
                index
              };
            }
          }
          return null;
        })
        .filter((item): item is { key: string; value: string; index: number } => item !== null);
    } catch (error) {
      console.error('Error extracting other data items:', error);
      return [];
    }
  }, [otherData]);
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/ContactDetailsOtherFields.tsx

  return (
    <div className="mt-6">
      <h3 className="mb-4 text-xl font-semibold">Other Data</h3>
      
      <div className="space-y-3">
        {getOtherDataItems().map(({ key, value, index }) => (
          <div key={index} className="flex items-end space-x-2">
            <TextInput
              label={key}
              value={value}
              onChange={(e) => handleOtherDataChange(index, key, e.target.value)}
              disabled={!editMode}
              className="flex-grow"
            />
            {editMode && (
              <Button
                onClick={() => removeOtherData(index)}
                variant="destructive"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <FaTrash className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
      
      {editMode && (
        <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <h4 className="mb-3 text-sm font-medium text-gray-700">Add New Field</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextInput
              label="Field Name"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Enter field name"
              className="w-full"
            />
            <TextInput
              label="Field Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Enter field value"
              className="w-full"
            />
          </div>
          <div className="mt-3">
            <Button
              onClick={addNewOtherData}
              disabled={!newKey.trim() || !newValue.trim()}
              className="bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
            >
              <FaPlus className="w-4 h-4 mr-2" />
              Add Field
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OtherDataFields;