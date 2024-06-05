import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useOutletContext } from "@remix-run/react";

export const loader = ({ request, params }) => {
  const { selected } = params;

  return json({ selected });
};

export default function SelectedType() {
  const { selected } = useLoaderData();
  const { selectedTable, audiences, campaigns, contacts } = useOutletContext();

  return (
    <div className="flex flex-auto border-2 border-l-0 border-slate-800 border-solid">
      <div className="flex flex-auto flex-col">
        <Outlet context={{ selectedTable, audiences, contacts, selected }} />
      </div>
    </div>
  );
}
