import { useFetcher } from "@remix-run/react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Search } from "lucide-react";
import { Contact } from "~/lib/types";

export interface ContactSearchDialogProps { 
    open: boolean; 
    onOpenChange: (open: boolean) => void; 
    campaignId: string; 
    workspaceId: string; 
    unfilteredCount: number; 
    onAddToQueue: (contacts: Contact[]) => void; 
}

export function ContactSearchDialog({ 
    open, 
    onOpenChange, 
    campaignId, 
    workspaceId, 
    unfilteredCount, 
    onAddToQueue 
}: ContactSearchDialogProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const contactFetcher = useFetcher<{ contacts: (Contact & { contact_audience: { audience_id: number }[], queued: boolean })[] }>();

    const handleSearch = (query: string) => {
        contactFetcher.load(`/api/contacts?q=${query}&workspace_id=${workspaceId}&campaign_id=${campaignId}`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white">
                <DialogHeader>
                    <DialogTitle>Search Contacts</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Search by name or phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)} />
                        <Button size="icon" onClick={() => handleSearch(searchQuery)}>
                            <Search className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="min-h-[200px]">
                        {contactFetcher.data?.contacts?.length ? (
                            <div className="space-y-2">
                                {contactFetcher.data.contacts.map((contact) => contact && (
                                    <div
                                        key={contact.id}
                                        className="grid grid-cols-[2fr,2fr,2fr,1fr] gap-2 p-2 border rounded-md hover:bg-gray-50 transition-colors text-sm"
                                    >
                                        <div className="truncate">
                                            {contact.firstname} {contact.surname}
                                        </div>
                                        <div className="truncate text-gray-600">
                                            {contact.phone && <div>{contact.phone}</div>}
                                            {contact.email && <div>{contact.email}</div>}
                                        </div>
                                        <div className="truncate text-gray-600">
                                            {contact.address}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={`text-xs w-full ${contact.queued ? "bg-green-500/20 border-green-500/60 hover:bg-green-500/30" : ""}`}
                                            disabled={contact.queued}
                                            onClick={() => onAddToQueue([contact])}
                                        >
                                            {contact.queued ? "Added" : "Add"}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 py-4">
                                No results found
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
} 