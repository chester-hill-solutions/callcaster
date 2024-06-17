import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useOutletContext } from "@remix-run/react";

export const loader = ({ request, params }) => {
  return null
};

export default function SelectedType() {
  const { selectedTable, audiences, campaigns } = useOutletContext();
  return <Outlet context={{ selectedTable, audiences, campaigns }} />;
}
