import React, { useState, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FaEdit, FaSave } from "react-icons/fa";
import ContactFields from "./ContactDetailsFields";
import OtherDataFields from "./ContactDetailsOtherFields";
import RecentContacts from "./RecentContacts";
import type { Audience, Contact, ContactAudience } from "@/lib/types";
import { logger } from "@/lib/logger.client";

// Enhanced type definitions
export interface ContactDetailsProps {
  contact?: Contact & { contact_audience?: ContactAudience[] };
  audiences: Audience[];
  userRole?: string;
  onDirtyChange?: (isDirty: boolean) => void;
  onChangesChange?: (hasChanges: boolean) => void;
}

export interface ContactDetailsState {
  editMode: boolean;
  isDirty: boolean;
  hasChanges: boolean;
}

export interface ContactUpdateData {
  [key: string]: unknown;
}

const ContactDetails: React.FC<ContactDetailsProps> = ({
  contact,
  audiences,
  userRole,
  onDirtyChange,
  onChangesChange,
}) => {
  const [editMode, setEditMode] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  // Enhanced handlers with better type safety
  const handleEdit = useCallback((): void => {
    try {
      setEditMode(true);
      setIsDirty(true);
      onDirtyChange?.(true);
    } catch (error) {
      logger.error('Error entering edit mode:', error);
    }
  }, [onDirtyChange]);

  const handleSave = useCallback((): void => {
    try {
      setEditMode(false);
      setIsDirty(false);
      setHasChanges(false);
      onDirtyChange?.(false);
      onChangesChange?.(false);
    } catch (error) {
      logger.error('Error saving contact:', error);
    }
  }, [onDirtyChange, onChangesChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    try {
      const { name, value } = e.target;
      const updateData: ContactUpdateData = { [name]: value };
      
      // Update contact data (this would typically be passed from parent)
      setHasChanges(true);
      onChangesChange?.(true);
    } catch (error) {
      logger.error('Error handling input change:', error);
    }
  }, [onChangesChange]);

  const handleAudienceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    try {
      const { checked, value } = e.target;
      const audienceId = parseInt(value);
      
      // Handle audience changes (this would typically be passed from parent)
      setHasChanges(true);
      onChangesChange?.(true);
    } catch (error) {
      logger.error('Error handling audience change:', error);
    }
  }, [onChangesChange]);

  // Helper function to check if contact is in audience
  const isContactInAudience = useCallback((audienceId: number): boolean => {
    try {
      return contact?.contact_audience?.some(
        (contactAud) => contactAud?.audience_id === audienceId
      ) || false;
    } catch (error) {
      logger.error('Error checking audience membership:', error);
      return false;
    }
  }, [contact]);

  // Helper function to safely get audience name
  const getAudienceName = useCallback((audience: Audience): string => {
    try {
      return audience.name || `Audience ${audience.id}`;
    } catch (error) {
      logger.error('Error getting audience name:', error);
      return `Audience ${audience.id}`;
    }
  }, []);

  return (
    <Card className="mx-auto w-full max-w-4xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Contact Details</h2>
          {isDirty && (
            <span className="text-sm text-orange-600 font-medium">
              Unsaved changes
            </span>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <ContactFields
          contact={contact}
          editMode={editMode}
          onInputChange={handleInputChange}
        />
        
        <div className="my-6">
          <h3 className="mb-4 text-xl font-semibold">Audiences</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {audiences.map((audience) => (
              <div key={audience.id} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  value={audience.id}
                  checked={isContactInAudience(audience.id)}
                  name={getAudienceName(audience)}
                  id={`audience-${audience.id}`}
                  onChange={handleAudienceChange}
                  disabled={!editMode}
                  className="rounded border-gray-300"
                />
                <label 
                  htmlFor={`audience-${audience.id}`}
                  className="text-sm font-medium text-gray-700"
                >
                  {getAudienceName(audience)}
                </label>
              </div>
            ))}
          </div>
        </div>

        <OtherDataFields
          otherData={contact?.other_data}
          editMode={editMode}
          setContact={(data: ContactUpdateData) => {
            try {
              // Handle other data changes
              setHasChanges(true);
              onChangesChange?.(true);
            } catch (error) {
              logger.error('Error updating other data:', error);
            }
          }}
        />
        
        <RecentContacts contact={contact} />
      </CardContent>
      
      <CardFooter className="flex justify-end space-x-2">
        {editMode ? (
          <Button
            onClick={handleSave}
            className="bg-green-500 text-white hover:bg-green-600"
            disabled={!hasChanges}
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
