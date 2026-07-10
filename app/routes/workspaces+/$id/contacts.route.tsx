export { loader } from "./contacts.loader.server";
export { default } from "@/components/contacts/ContactsPage";

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";

import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [{ title: "Contacts — CallCaster" }];
