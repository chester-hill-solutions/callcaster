import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useOutletContext } from "@remix-run/react";

export const loader = ({ request, params }) => {
  const { selected } = params;

  return json({ selected });
};

export default function SelectedType() {
  const { selected } = useLoaderData();
  const { selectedTable, audiences, campaigns, contacts } = useOutletContext();

  return <Outlet context={{ selectedTable, audiences, contacts, selected }} />;
}
