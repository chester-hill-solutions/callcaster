import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { Trash } from "lucide-react";

import { Button } from "./ui/button";
import { AudienceContactRow } from "./AudienceContactRow";
import { ContactForm } from "./ContactForm";
import { Contact } from "~/lib/types";
import { Json } from "~/lib/database.types";

// Types
interface ContactTableProps {
  contacts: Contact[];
  audience_id: string | number;
  newContact: {
    name: string;
    phone: string;
    email: string;
    address: string;
    firstname?: string;
    surname?: string;
    id?: number;
  };
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSaveContact: () => Promise<void>;
  workspace_id: string;
  handleRemoveContact: (id: number) => void;
  onBulkDeleteComplete?: (deletedIds: number[]) => void;
}

interface BulkDeleteResponse {
  success?: boolean;
  message?: string;
  removed_count?: number;
  new_total?: number;
  error?: string;
}

const ContactTable = ({
  contacts,
  audience_id,
  newContact,
  handleInputChange,
  handleSaveContact,
  workspace_id,
  handleRemoveContact,
  onBulkDeleteComplete,
}: ContactTableProps) => {
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const fetcher = useFetcher<BulkDeleteResponse>();

  // Extract unique headers from other_data
  const otherDataHeaders = Array.from(
    new Set(
      contacts.flatMap((contact) =>
        contact.other_data.flatMap((data: Json) => {
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            return Object.keys(data);
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

  // Contact selection handlers
  const handleSelectContact = (contactId: number, isSelected: boolean) => {
    if (isSelected) {
      setSelectedContacts(prev => [...prev, contactId]);
    } else {
      setSelectedContacts(prev => prev.filter(id => id !== contactId));
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedContacts(contacts.map(contact => contact.id));
    } else {
      setSelectedContacts([]);
    }
  };

  // Bulk delete handler
  const handleBulkDelete = () => {
    if (selectedContacts.length === 0) return;

    const formData = new FormData();
    formData.append('audience_id', audience_id.toString());
    selectedContacts.forEach(contactId => {
      formData.append('contact_ids[]', contactId.toString());
    });

    fetcher.submit(formData, {
      action: '/api/contact-audience/bulk-delete',
      method: "DELETE",
      encType: "multipart/form-data"
    });
  };

  // Render bulk action bar when contacts are selected
  const renderBulkActionBar = () => {
    if (selectedContacts.length === 0) return null;

    return (
      <div className="mb-4 p-2 bg-gray-100 rounded flex justify-between items-center">
        <span className="text-sm font-medium">
          {selectedContacts.length} contacts selected
        </span>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleBulkDelete}
          className="flex items-center gap-1"
          disabled={fetcher.state !== 'idle'}
        >
          {fetcher.state !== 'idle' ? (
            'Deleting...'
          ) : (
            <>
              <Trash size={16} />
              Delete Selected
            </>
          )}
        </Button>
      </div>
    );
  };

  // Table header cell component
  const TableHeader = ({ children }: { children: React.ReactNode }) => (
    <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
      {children}
    </th>
  );

  return (
    <div className="w-full">
      {renderBulkActionBar()}

      <div className="overflow-x-auto">
        <table className="divide-y divide-gray-200 min-w-full">
          <thead className="sticky top-0 bg-primary">
            <tr>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={selectedContacts.length > 0 && selectedContacts.length === contacts.length}
                  className="rounded border-gray-300"
                  disabled={fetcher.state !== 'idle'}
                />
              </th>
              <TableHeader>ID</TableHeader>
              <TableHeader>External ID</TableHeader>
              <TableHeader>First Name</TableHeader>
              <TableHeader>Last Name</TableHeader>
              <TableHeader>Phone</TableHeader>
              <TableHeader>Email</TableHeader>
              <TableHeader>Address</TableHeader>
              <TableHeader>City</TableHeader>
              <TableHeader>Date Created</TableHeader>

              {otherDataHeaders.map((header) => (
                <TableHeader key={header}>{header}</TableHeader>
              ))}

              <TableHeader>Remove</TableHeader>
              <TableHeader>Edit</TableHeader>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {contacts.map((contact) => (
              <AudienceContactRow
                key={contact.id}
                contact={contact}
                otherDataHeaders={otherDataHeaders}
                handleRemoveContact={handleRemoveContact}
                isSelected={selectedContacts.includes(contact.id)}
                onSelectContact={handleSelectContact}
                disabled={fetcher.state !== 'idle'}
              />
            ))}

            {/* Hidden row for contact form */}
            <tr hidden>
              <td colSpan={4}>
                <ContactForm
                  isNew={true}
                  newContact={newContact}
                  handleInputChange={handleInputChange}
                  handleSaveContact={handleSaveContact}
                  workspace_id={workspace_id}
                  audience_id={audience_id}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export { ContactTable };
