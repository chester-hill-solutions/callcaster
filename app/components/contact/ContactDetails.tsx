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
import { buildContactEditorDraft } from "@/lib/contact-editor";

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
  disabled?: boolean;
}

export interface ContactDetailsState {
  editMode: boolean;
  isDirty: boolean;
  hasChanges: boolean;
}

export interface ContactUpdateData {
  [key: string]: unknown;
}

export interface ContactDetailsHandle {
  getFormValues: () => Record<string, string>;
  reset: () => void;
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
    disabled = false,
  },
  ref,
) {
  const [editMode, setEditMode] = useState<boolean>(startEditable);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [draft, setDraft] = useState(() => buildContactEditorDraft(contact));

  useImperativeHandle(
    ref,
    () => ({
      getFormValues: () => ({
        ...draft.fields,
        audience_ids: JSON.stringify(draft.audienceIds),
        other_data: JSON.stringify(draft.otherData),
      }),
      reset: () => {
        setDraft(buildContactEditorDraft(contact));
        setResetVersion(version => version + 1);
        setIsDirty(false);
        onDirtyChange?.(false);
        onChangesChange?.(false);
      },
    }),
    [draft, contact, onDirtyChange, onChangesChange],
  );

  const effectiveContact = useMemo(
    () => ({ ...(contact ?? {}), ...draft.fields }) as Contact,
    [contact, draft.fields],
  );

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
      setDraft((prev) => ({ ...prev, fields: { ...prev.fields, [name]: value } }));
      setIsDirty(true);
      onDirtyChange?.(true);
      onChangesChange?.(true);
    } catch (error) {
      logger.error('Error handling input change:', error);
    }
  }, [onDirtyChange, onChangesChange]);

  const handleAudienceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    try {
      const { checked, value } = e.target;
      const audienceId = Number(value);
      setDraft(prev => ({ ...prev, audienceIds: checked
        ? [...new Set([...prev.audienceIds, audienceId])]
        : prev.audienceIds.filter(id => id !== audienceId) }));
      setIsDirty(true);
      onDirtyChange?.(true);
      onChangesChange?.(true);
    } catch (error) {
      logger.error('Error handling audience change:', error);
    }
  }, [onChangesChange, onDirtyChange]);

  const getAudienceName = useCallback((audience: Audience): string => {
    try {
      return audience.name || `Call list ${audience.id}`;
    } catch (error) {
      logger.error('Error getting audience name:', error);
      return `Call list ${audience.id}`;
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <Heading level={3}>Contact Details</Heading>
        {isDirty && (
          <span className="text-sm font-medium text-warning-text">
            Unsaved changes
          </span>
        )}
      </div>

      <ContactFields
        contact={effectiveContact}
        editMode={editMode && !disabled}
        onInputChange={handleInputChange}
      />

      <div className="border-t border-border pt-6">
        <Heading level={4} className="mb-4">Call lists</Heading>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {audiences.map((audience) => (
            <div key={audience.id} className="flex items-center space-x-2">
              <input
                type="checkbox"
                value={audience.id}
                checked={draft.audienceIds.includes(audience.id)}
                name={getAudienceName(audience)}
                id={`audience-${audience.id}`}
                onChange={handleAudienceChange}
                disabled={!editMode || disabled}
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
        key={resetVersion}
        otherData={draft.otherData}
        editMode={editMode}
        disabled={disabled}
        setContact={(data: ContactUpdateData) => {
          if (!Array.isArray(data.other_data)) return;
          setDraft(prev => ({ ...prev, otherData: data.other_data as Json[] }));
          setIsDirty(true);
          onDirtyChange?.(true);
          onChangesChange?.(true);
        }}
      />

      <RecentContacts contact={contact} />

      {/* There is only one working Save action (the page header's, which
          submits to the server) — this footer's only job is the Edit gate
          for existing contacts. New contacts start editable and skip it. */}
      {!editMode && (
        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={handleEdit} disabled={disabled}>
            <FaEdit className="mr-2" /> Edit
          </Button>
        </div>
      )}
    </div>
  );
});

export default ContactDetails;
