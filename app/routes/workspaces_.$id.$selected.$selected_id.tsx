import { json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useMemo } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { AudienceTable } from "../components/AudienceTable";
import { CampaignSettings } from "../components/CampaignSettings";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id, selected } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspace_id);
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
    if (selected === "campaigns") {
      const { error: detailsError } = await supabaseClient
        .from("live_campaign")
        .insert({ campaign_id: data[0].id, workspace: workspace_id });
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
        .select(
          `*,
        campaign(*)
        `,
        )
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
  let data = [];
  const { data: mtmData, error } = await mtmQuery;
  if (error) {
    console.error(error);
  }
  data = [...mtmData];
  if (
    selected === "campaigns" &&
    data.length > 0 &&
    data[0].campaign.type === "live_call"
  ) {
    const { data: campaignDetails, error: detailsError } = await supabaseClient
      .from("live_campaign")
      .select()
      .eq("campaign_id", selected_id)
      .single();
    if (detailsError) console.error(detailsError);
    data = data.map((item) => ({
      ...item,
      campaignDetails,
    }));
  }
  return json({ workspace_id, selected_id, data, selected, mediaData });
};

export default function Audience() {
  const { selectedTable, audiences, contacts = [] } = useOutletContext();
  const { workspace_id, selected_id, data = [], mediaData } = useLoaderData();
  const submit = useSubmit();
  const addAudience = (audience) => {
    submit(
      {
        audience_id: audience.id,
        campaign_id: selected_id,
      },
      {
        method: "POST",
        encType: "application/json",
        action: "/api/campaign_audience",
      },
    );
  };
  const removeAudience = (audience) => {
    submit(
      {
        audience_id: audience.id,
        campaign_id: selected_id,
      },
      {
        method: "DELETE",
        encType: "application/json",
        action: "/api/campaign_audience",
      },
    );
  };
  const ids = useMemo(
    () =>
      data.map(
        (row) =>
          row[
            `${selectedTable?.name.substring(0, selectedTable.name.length - 1)}_id`
          ],
      ),
    [data, selectedTable],
  );
  const audienceContacts = useMemo(
    () => contacts?.filter((contact) => ids.includes(contact.id)),
    [contacts, ids],
  );
  const audience = useMemo(
    () => audiences?.find((audience) => audience.id === parseInt(selected_id)),
    [audiences, selected_id],
  );
  const pageData = useMemo(() => data, [data]);

  return (
    <div className="flex flex-col">
      {selectedTable?.name.toLowerCase() === "audiences" && (
        <AudienceTable
          {...{
            data: pageData,
            contacts: audienceContacts,
            workspace_id,
            selected_id,
            audience,
          }}
        />
      )}
      {selectedTable?.name.toLowerCase() === "campaigns" && (
        <CampaignSettings
          data={pageData}
          audiences={audiences}
          mediaData={mediaData}
          addAudience={addAudience}
          removeAudience={removeAudience}
        />
      )}
    </div>
  );
}
