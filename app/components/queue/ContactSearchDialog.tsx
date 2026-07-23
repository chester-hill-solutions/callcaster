import { useFetcher } from "react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { Contact } from "@/lib/types";

export interface ContactSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  workspaceId: string;
  unfilteredCount: number;
  onAddToQueue: (contacts: Contact[]) => void;
}

/** Inline workspace contact search — no modal/popover (search stays on the page). */
export function ContactSearchDialog({
  open,
  onOpenChange,
  campaignId,
  workspaceId,
  onAddToQueue,
}: ContactSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const contactFetcher = useFetcher<{
    contacts: (Contact & {
      contact_audience: { audience_id: number }[];
      queued: boolean;
    })[];
  }>();

  const handleSearch = (query: string) => {
    contactFetcher.load(
      `/api/contacts?q=${query}&workspace_id=${workspaceId}&campaign_id=${campaignId}`,
    );
  };

  if (!open) return null;

  return (
    <section
      className="mb-4 rounded-lg border border-border bg-card p-4"
      aria-labelledby="contact-search-heading"
      data-testid="contact-search-panel"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3
            id="contact-search-heading"
            className="text-base font-semibold text-foreground"
          >
            Search Contacts
          </h3>
          <p className="text-sm text-muted-foreground">
            Search for contacts in this workspace and add matching contacts to
            the queue.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close contact search"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch(searchQuery);
              }
            }}
          />
          <Button
            size="icon"
            aria-label="Search contacts"
            onClick={() => handleSearch(searchQuery)}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-[200px]">
          {contactFetcher.data?.contacts?.length ? (
            <div className="space-y-2">
              {contactFetcher.data.contacts.map(
                (contact) =>
                  contact && (
                    <div
                      key={contact.id}
                      className="grid grid-cols-[2fr,2fr,2fr,1fr] gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-muted/50"
                    >
                      <div className="truncate">
                        {contact.firstname} {contact.surname}
                      </div>
                      <div className="truncate text-muted-foreground">
                        {contact.phone && <div>{contact.phone}</div>}
                        {contact.email && <div>{contact.email}</div>}
                      </div>
                      <div className="truncate text-muted-foreground">
                        {contact.address}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`w-full text-xs ${contact.queued ? "border-emerald-500/60 bg-emerald-500/20 hover:bg-emerald-500/30" : ""}`}
                        disabled={contact.queued}
                        onClick={() => onAddToQueue([contact])}
                      >
                        {contact.queued ? "Added" : "Add"}
                      </Button>
                    </div>
                  ),
              )}
            </div>
          ) : (
            <div className="py-4 text-center text-muted-foreground">
              No results found
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
