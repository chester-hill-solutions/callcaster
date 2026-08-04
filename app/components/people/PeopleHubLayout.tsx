import type { ReactNode } from "react";
import { NavLink, useParams } from "react-router";
import { BookUser, Users } from "lucide-react";

const tabClassName = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
    isActive
      ? "bg-brand-primary text-white"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

export function PeopleHubLayout({ children }: { children: ReactNode }) {
  const { id: workspaceId } = useParams();
  const baseUrl = `/workspaces/${workspaceId}`;

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            People
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize contacts and Call lists for your campaigns.
          </p>
        </div>
        <nav
          aria-label="People sections"
          className="flex w-fit gap-1 rounded-lg bg-muted/40 p-1"
        >
          <NavLink to={`${baseUrl}/audiences`} className={tabClassName}>
            <Users className="h-4 w-4" />
            Call lists
          </NavLink>
          <NavLink to={`${baseUrl}/contacts`} className={tabClassName}>
            <BookUser className="h-4 w-4" />
            Contacts
          </NavLink>
        </nav>
      </header>
      {children}
    </div>
  );
}
