export { loader } from "./contacts.loader.server";

import { Outlet, useOutlet } from "react-router";
import type { MetaFunction } from "react-router";
import ContactsPage from "@/components/contacts/ContactsPage";

export const meta: MetaFunction = () => [{ title: "Contacts — CallCaster" }];

export default function WorkspaceContactsPage() {
  const outlet = useOutlet();

  if (outlet) {
    return <Outlet />;
  }

  return <ContactsPage />;
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
