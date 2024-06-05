import { json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext } from "@remix-run/react";
import { useMemo } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { AudienceTable } from "../components/AudienceTable";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id, selected } = params;
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (selected_id === "new") {
    let query = supabaseClient;
    switch (selected) {
      case "audiences":
        query = query
          .from("audience")
          .insert({ workspace: workspace_id })
          .select();
        break;
      case "campaigns":
        query = query
          .from("campaign")
          .insert({ workspace: workspace_id })
          .select();
        break;
      case "contact":
        query = query
          .from("contact")
          .insert({ workspace: workspace_id })
          .select();
        break;
      default:
        console.error("No valid table detected");
        return redirect(`/workspaces/${workspace_id}`);
    }
    const { data, error } = await query;
    if (error) {
      console.log(error);
      return redirect(`/workspaces/${workspace_id}`);
    }
    return redirect(`/workspaces/${workspace_id}/${selected}/${data[0].id}`);
  }

  let mtmQuery = supabaseClient.from("");
  switch (selected) {
    case "audiences":
      mtmQuery = supabaseClient
        .from("contact_audience")
        .select()
        .eq("audience_id", selected_id);
      break;
    case "campaigns":
      mtmQuery = supabaseClient
        .from("campaign_audience")
        .select()
        .eq("campaign_id", selected_id);
      break;
    case "contact":
      mtmQuery = supabaseClient
        .from("contact_audience")
        .select()
        .eq("contact_id", selected_id);
      break;
    default:
      console.error("No valid table detected");
      return redirect(`/workspaces/${workspace_id}`);
  }
  if (selected === 'campaigns') return redirect(`call`)
  const { data, error } = await mtmQuery;
  if (error) {
    console.error(error);
  }

  return json({ workspace_id, selected_id, data });
};

export default function Audience() {
  const { selectedTable, audiences, contacts = [] } = useOutletContext();
  const { workspace_id, selected_id, data = [] } = useLoaderData();

  const ids = useMemo(() => data.map((row) => row.contact_id), [data]);
  const audienceContacts = useMemo(
    () => contacts.filter((contact) => ids.includes(contact.id)),
    [contacts, ids],
  );
  const audience = useMemo(
    () => audiences.find((audience) => audience.id === parseInt(selected_id)),
    [audiences, selected_id],
  );

  return (
    <div className="flex flex-col">
      {selectedTable.name === "audiences" && (
        <AudienceTable
          {...{
            data,
            contacts: audienceContacts,
            workspace_id,
            selected_id,
            audience,
          }}
        />
      )}
    </div>
  );
}
