import { json, redirect } from "@remix-run/node";
import {
  Outlet,
  useLoaderData,
  useNavigate,
  useOutlet,
  useOutletContext,
} from "@remix-run/react";
import { MdAssignment } from "react-icons/md";
import { EmptyState } from "~/components/ui/emptystate";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const loader = async ({ request, params }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession) {
    return redirect("/signin", { headers });
  }
  return null;
};

export default function SelectedType() {
  const { selectedTable, audiences, campaigns } = useOutletContext();
  return (
    <div>
      <Outlet context={{ selectedTable, audiences, campaigns }} />
    </div>
  );
}
