import type { ReactNode } from "react";
import { NavLink, useParams } from "react-router";
import { BookUser, Users } from "lucide-react";
import { Heading } from "@/components/ui/typography";

const tabClassName = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
    isActive
      ? "bg-brand-primary text-white"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

export function PeopleHubLayout({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const { id: workspaceId } = useParams();
  const baseUrl = `/workspaces/${workspaceId}`;

  return (
    <div className="space-y-5">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Heading as="h1" level={2} branded={false}>
            {title}
          </Heading>
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
        </div>
      </header>
      {children}
    </div>
  );
}
