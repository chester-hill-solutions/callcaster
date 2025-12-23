import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AudienceContactRow } from "./AudienceContactRow";
import { ContactForm } from "./ContactForm";
<<<<<<< HEAD:app/components/contact/ContactTable.tsx
import { Contact } from "@/lib/types";
import { Json } from "@/lib/database.types";
=======
import type { Contact } from "~/lib/types";
import type { Json } from "~/lib/database.types";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/ContactTable.tsx

// Enhanced type definitions
export interface ContactTableProps {
  contacts: Contact[];
  audience_id: string | number;
  newContact: Partial<Contact>;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSaveContact: () => Promise<void>;
  workspace_id: string;
  handleRemoveContact: (id: number) => void;
  onBulkDeleteComplete?: (deletedIds: number[]) => void;
}

export interface BulkDeleteResponse {
  success?: boolean;
  message?: string;
  removed_count?: number;
  new_total?: number;
  error?: string;
}

export interface ContactTableState {
  selectedContacts: number[];
}

const ContactTable: React.FC<ContactTableProps> = ({
  contacts,
  audience_id,
  newContact,
  handleInputChange,
  handleSaveContact,
  workspace_id,
  handleRemoveContact,
  onBulkDeleteComplete,
}) => {
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const fetcher = useFetcher<BulkDeleteResponse>();

  // Extract unique headers from other_data with better type safety
  const otherDataHeaders = Array.from(
    new Set(
      contacts.flatMap((contact) =>
        contact.other_data.flatMap((data: Json) => {
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            return Object.keys(data as Record<string, unknown>);
          }
          return [];
        }),
      ),
    ),
  );

  // Handle bulk delete completion
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      if (onBulkDeleteComplete && selectedContacts.length > 0) {
        onBulkDeleteComplete(selectedContacts);
        setSelectedContacts([]);
      }
    }
  }, [fetcher.state, fetcher.data, onBulkDeleteComplete, selectedContacts]);

  // Contact selection handlers with better type safety
  const handleSelectContact = (contactId: number, isSelected: boolean): void => {
    if (isSelected) {
      setSelectedContacts(prev => [...prev, contactId]);
    } else {
      setSelectedContacts(prev => prev.filter(id => id !== contactId));
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.checked) {
      setSelectedContacts(contacts.map(contact => contact.id));
    } else {
      setSelectedContacts([]);
    }
  };

  // Bulk delete handler with better error handling
  const handleBulkDelete = (): void => {
    if (selectedContacts.length === 0) return;

    try {
      const formData = new FormData();
      formData.append('audience_id', audience_id.toString());
      selectedContacts.forEach(contactId => {
        formData.append('contact_ids[]', contactId.toString());
      });

      fetcher.submit(formData, {
        method: 'POST',
        action: '/api/contact-audience/bulk-delete',
      });
    } catch (error) {
      console.error('Error initiating bulk delete:', error);
    }
  };

  const renderBulkActionBar = (): JSX.Element | null => {
    if (selectedContacts.length === 0) return null;

    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-blue-900">
              {selectedContacts.length} contact{selectedContacts.length !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              onClick={handleBulkDelete}
              disabled={fetcher.state !== 'idle'}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash className="w-4 h-4 mr-2" />
              Delete Selected
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const TableHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
      {children}
    </div>
  );

  return (
    <div className="space-y-4">
      {renderBulkActionBar()}
      
      <div className="bg-white rounded-lg shadow">
        <TableHeader>
          <div className="flex items-center space-x-4">
            <input
              type="checkbox"
              checked={selectedContacts.length === contacts.length && contacts.length > 0}
              onChange={handleSelectAll}
              className="rounded border-gray-300"
            />
            <span className="font-medium">Contacts ({contacts.length})</span>
          </div>
        </TableHeader>

        <div className="divide-y divide-gray-200">
          {contacts.map((contact) => (
            <AudienceContactRow
              key={contact.id}
              contact={contact}
              audience_id={audience_id}
              isSelected={selectedContacts.includes(contact.id)}
              onSelect={handleSelectContact}
              onRemove={handleRemoveContact}
              otherDataHeaders={otherDataHeaders}
            />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-medium mb-4">Add New Contact</h3>
        <ContactForm
          isNew={true}
          newContact={newContact}
          handleInputChange={handleInputChange}
          handleSaveContact={handleSaveContact}
          workspace_id={workspace_id}
          audience_id={audience_id.toString()}
        />
      </div>
    </div>
  );
};

export { ContactTable };
