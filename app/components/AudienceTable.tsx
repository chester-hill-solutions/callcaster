import { useEffect, useState, FormEvent } from "react";
import { Button } from "./ui/button";
import { AudienceForm } from "./AudienceForm";
import { ImportIcon, Download, Search, X } from "lucide-react";
import { useSearchParams, useSubmit } from "@remix-run/react";
import TablePagination from "./TablePagination";
import { Input } from "./ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "./ui/table";
import { Checkbox } from "./ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Database } from "~/lib/database.types";
import { Contact } from "~/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type AudienceTableProps = {
  contacts: Array<{ contact: Database['public']['Tables']['contact']['Row'] }> | null;
  workspace_id: string | undefined;
  selected_id: string | undefined;
  audience: Database['public']['Tables']['audience']['Row'] | null;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalCount: number | null;
  };
  sorting: {
    sortKey: string;
    sortDirection: 'asc' | 'desc';
  };
};

export function AudienceTable({
  contacts: initialContacts,
  workspace_id,
  selected_id: audience_id,
  audience: initialAudience,
  pagination,
  sorting
}: AudienceTableProps) {
  // Transform the contacts data to extract the nested contact info
  const transformedContacts = initialContacts?.map(item => item.contact) || [];
  const [contacts, setContacts] = useState<Contact[]>(transformedContacts);
  const [audienceInfo, setAudienceInfo] = useState(initialAudience);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  const submit = useSubmit();

  useEffect(() => {
    const transformed = initialContacts?.map(item => item.contact) || [];
    setContacts(transformed);
    setAudienceInfo(initialAudience);
  }, [initialContacts, initialAudience]);

  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", newPage.toString());
    setSearchParams(newParams);
  };

  const handlePageSizeChange = (newSize: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", "1");
    newParams.set("pageSize", newSize);
    setSearchParams(newParams);
  };

  const handleSaveAudience = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const response = await fetch("/api/audiences", {
      method: "PATCH",
      body: formData,
    });
    const result = await response.json();

    if (response.ok) {
      setAudienceInfo(result);
    } else {
      console.error("Failed to save audience", result);
    }
  };

  const handleRemoveContact = async (id: number) => {
    // Optimistically update UI
    setContacts((curr) => curr.filter((contact) => contact.id !== id));

    const formData = new FormData();
    formData.append('contact_id', id.toString());
    formData.append('audience_id', audience_id || '');

    submit(formData, {
      action: '/api/contact-audience',
      method: "DELETE",
      navigate: false
    });
  };

  const handleRemoveSelected = async () => {
    if (selectedContacts.length === 0) return;

    // Convert string IDs to numbers for filtering
    const selectedIds = selectedContacts.map(id => parseInt(id, 10));

    // Remove contacts from UI immediately (optimistic update)
    setContacts((curr) => curr.filter((contact) => !selectedIds.includes(contact.id)));

    // Create form data with all selected contacts
    const formData = new FormData();
    selectedContacts.forEach(id => {
      formData.append('contact_ids[]', id);
    });
    formData.append('audience_id', audience_id || '');

    // Submit the form
    submit(formData, {
      action: '/api/contact-audience/bulk-delete',
      method: "DELETE",
      navigate: false
    });

    // Clear selection
    setSelectedContacts([]);
  };

  const handleExportCSV = () => {
    // Create CSV content
    const headers = ["id", "firstname", "surname", "phone", "email", "address", "city", "province", "postal", "country"];
    const csvContent = [
      headers.join(","),
      ...contacts.map(contact =>
        headers.map(header =>
          JSON.stringify((contact as any)[header] || "")
        ).join(",")
      )
    ].join("\n");

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `audience_${audience_id}_contacts.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (key: string) => {
    const newParams = new URLSearchParams(searchParams);

    // If already sorting by this key, toggle direction
    if (sorting.sortKey === key) {
      const newDirection = sorting.sortDirection === 'asc' ? 'desc' : 'asc';
      newParams.set("sortDirection", newDirection);
    } else {
      // New sort key, default to ascending
      newParams.set("sortKey", key);
      newParams.set("sortDirection", "asc");
    }

    // Reset to first page when sorting changes
    newParams.set("page", "1");

    setSearchParams(newParams);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(contacts.map(contact => contact.id.toString()));
    } else {
      setSelectedContacts([]);
    }
  };

  const handleSelectContact = (id: number, checked: boolean) => {
    const idStr = id.toString();
    if (checked) {
      setSelectedContacts(prev => [...prev, idStr]);
    } else {
      setSelectedContacts(prev => prev.filter(contactId => contactId !== idStr));
    }
  };

  // Filter contacts based on search term (client-side filtering only)
  const filteredContacts = contacts.filter(contact => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      (contact.firstname?.toLowerCase().includes(searchLower) || false) ||
      (contact.surname?.toLowerCase().includes(searchLower) || false) ||
      (contact.email?.toLowerCase().includes(searchLower) || false) ||
      (contact.phone?.toLowerCase().includes(searchLower) || false)
    );
  });

  const totalPages = Math.ceil((pagination.totalCount || 0) / pagination.pageSize);

  return (
    <div className="w-full space-y-4">
      <div id="audience-settings" className="flex justify-between items-center">
        <AudienceForm
          audienceInfo={audienceInfo}
          handleSaveAudience={handleSaveAudience}
          audience_id={audience_id}
          workspace_id={workspace_id}
        />
      </div>
      <div className="flex justify-between items-center mb-4">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full"
              onClick={() => setSearchTerm("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={pagination.pageSize.toString()}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="w-[120px] text-muted-foreground">
              <SelectValue placeholder="Rows per page" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 per page</SelectItem>
              <SelectItem value="25">25 per page</SelectItem>
              <SelectItem value="50">50 per page</SelectItem>
              <SelectItem value="100">100 per page</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-muted-foreground">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>

          {selectedContacts.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleRemoveSelected}>
              Remove Selected ({selectedContacts.length})
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={selectedContacts.length === contacts.length && contacts.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort('id')}
              >
                ID {sorting.sortKey === 'id' && (sorting.sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort('firstname')}
              >
                First Name {sorting.sortKey === 'firstname' && (sorting.sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort('surname')}
              >
                Last Name {sorting.sortKey === 'surname' && (sorting.sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort('phone')}
              >
                Phone {sorting.sortKey === 'phone' && (sorting.sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort('email')}
              >
                Email {sorting.sortKey === 'email' && (sorting.sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort('address')}
              >
                Address {sorting.sortKey === 'address' && (sorting.sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort('city')}
              >
                City {sorting.sortKey === 'city' && (sorting.sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  {searchTerm ? "No contacts found matching your search" : "No contacts in this audience yet"}
                </TableCell>
              </TableRow>
            ) : (
              filteredContacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedContacts.includes(contact.id.toString())}
                      onCheckedChange={(checked) => handleSelectContact(contact.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell>{contact.id}</TableCell>
                  <TableCell>{contact.firstname}</TableCell>
                  <TableCell>{contact.surname}</TableCell>
                  <TableCell>{contact.phone}</TableCell>
                  <TableCell>{contact.email}</TableCell>
                  <TableCell>{contact.address}</TableCell>
                  <TableCell>{contact.city}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Actions
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Contact Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <a href={`/workspaces/${workspace_id}/contacts/${contact.id}`}>
                            Edit Contact
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRemoveContact(contact.id)}>
                          Remove from Audience
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {filteredContacts.length} of {pagination.totalCount || 0} contacts
        </div>
        <TablePagination
          currentPage={pagination.currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
} 