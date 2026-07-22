import React, { useState, useCallback, useImperativeHandle, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/typography";
import { FaEdit } from "react-icons/fa";
import ContactFields from "./ContactDetailsFields";
import OtherDataFields from "./ContactDetailsOtherFields";
import RecentContacts from "./RecentContacts";
import type { Audience, Contact, ContactAudience } from "@/lib/types";
import type { Json } from "@/lib/db-types";
import { logger } from "@/lib/logger.client";

// Enhanced type definitions
export interface ContactDetailsProps {
  contact?: Contact & { contact_audience?: ContactAudience[] };
  audiences: Audience[];
  userRole?: string;
  onDirtyChange?: (isDirty: boolean) => void;
  onChangesChange?: (hasChanges: boolean) => void;
  /**
   * Contacts created via "New Contact" have no saved state to protect, so the
   * fields should be editable on arrival instead of gated behind an Edit
   * button that only makes sense once there is something to accidentally
   * overwrite.
   */
  startEditable?: boolean;
}

export interface ContactDetailsState {
  editMode: boolean;
  isDirty: boolean;
  hasChanges: boolean;
}

export interface ContactUpdateData {
  [key: string]: unknown;
}

/** Text fields editable via ContactFields — the set the Save button submits. */
const EDITABLE_FIELD_NAMES = [
  "firstname",
  "surname",
  "phone",
  "email",
  "address",
  "city",
  "province",
  "postal",
] as const;

/** Imperative handle so the route's single header Save/Reset can read and
 * clear this component's in-progress edits without lifting all field state
 * up (audiences/other-data stay local; only the persisted text fields need
 * to reach the action). */
export interface ContactDetailsHandle {
  getFormValues: () => Record<string, string>;
  reset: () => void;
}

function buildFieldValues(
  contact?: Contact | null,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of EDITABLE_FIELD_NAMES) {
    const value = contact?.[name];
    values[name] = value != null ? String(value) : "";
  }
  return values;
}

const ContactDetails = React.forwardRef<
  ContactDetailsHandle,
  ContactDetailsProps
>(function ContactDetails(
  {
    contact,
    audiences,
    userRole,
    onDirtyChange,
    onChangesChange,
    startEditable = false,
  },
  ref,
) {
  const [editMode, setEditMode] = useState<boolean>(startEditable);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    buildFieldValues(contact),
  );

  useImperativeHandle(
    ref,
    () => ({
      getFormValues: () => fieldValues,
      reset: () => {
        setFieldValues(buildFieldValues(contact));
        setIsDirty(false);
        setHasChanges(false);
        onDirtyChange?.(false);
        onChangesChange?.(false);
      },
    }),
    [fieldValues, contact, onDirtyChange, onChangesChange],
  );

  // The values ContactFields renders: saved contact data overlaid with
  // whatever the user has typed so far, so edits are visible immediately.
  const effectiveContact = useMemo(
    () => ({ ...(contact ?? {}), ...fieldValues }) as Contact,
    [contact, fieldValues],
  );

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

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    try {
      const { name, value } = e.target;
      setFieldValues((prev) => ({ ...prev, [name]: value }));
      setIsDirty(true);
      setHasChanges(true);
      onDirtyChange?.(true);
      onChangesChange?.(true);
    } catch (error) {
      logger.error('Error handling input change:', error);
    }
  }, [onDirtyChange, onChangesChange]);

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
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <Heading level={3}>Contact Details</Heading>
        {isDirty && (
          <span className="text-sm font-medium text-warning">
            Unsaved changes
          </span>
        )}
      </div>

      <ContactFields
        contact={effectiveContact}
        editMode={editMode}
        onInputChange={handleInputChange}
      />

      <div className="border-t border-border pt-6">
        <Heading level={4} className="mb-4">Audiences</Heading>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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
                className="rounded border-input"
              />
              <label
                htmlFor={`audience-${audience.id}`}
                className="text-sm font-medium text-foreground"
              >
                {getAudienceName(audience)}
              </label>
            </div>
          ))}
        </div>
      </div>

      <OtherDataFields
        otherData={(() => {
          // other_data is a jsonb array since 20260722110000; tolerate a
          // legacy stringified value defensively (pre-migration snapshots).
          const raw: unknown = contact?.other_data;
          if (Array.isArray(raw)) return raw as Json[];
          if (typeof raw === "string") {
            try {
              const parsed = JSON.parse(raw) as Json[];
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          }
          return [];
        })()}
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

      {/* There is only one working Save action (the page header's, which
          submits to the server) — this footer's only job is the Edit gate
          for existing contacts. New contacts start editable and skip it. */}
      {!editMode && (
        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={handleEdit}>
            <FaEdit className="mr-2" /> Edit
          </Button>
        </div>
      )}
    </div>
  );
});

export default ContactDetails;
