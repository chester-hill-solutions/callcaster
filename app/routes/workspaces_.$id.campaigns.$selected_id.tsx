import { json, redirect } from "@remix-run/node";
import {
  useLoaderData,
  useOutletContext,
  useSubmit,
  useNavigation,
} from "@remix-run/react";
import { useMemo, useState, useReducer, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { CampaignSettings } from "../components/CampaignSettings";
import { Button } from "~/components/ui/button";
import { deepEqual } from "~/lib/utils";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id, selected } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  if (selected_id === "new") {
    const query = supabaseClient
      .from("campaign")
      .insert({ workspace: workspace_id })
      .select();
    const { data, error } = await query;
    if (error) {
      console.log(error);
      return redirect(`/workspaces/${workspace_id}`);
    }

    const { error: detailsError } = await supabaseClient
      .from("live_campaign")
      .insert({ campaign_id: data[0].id, workspace: workspace_id });
    return redirect(`/workspaces/${workspace_id}/campaign/${data[0].id}`);
  }
  const { data: mtmData, error: mtmError } = await supabaseClient
    .from("campaign")
    .select(
      `*,
        campaign_audience(*)
        `,
    )
    .eq("id", selected_id);
  let data = [...mtmData];
  if (data.length > 0 && data[0].type === "live_call") {
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
  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspace_id);

  return json({ workspace_id, selected_id, data, selected, mediaData });
};

const initialState = (data, workspace, campaign_id) => ({
  campaign_id,
  workspace,
  title: data[0]?.title,
  status: data[0]?.status,
  type: data[0]?.type || "live_call",
  dial_type: data[0]?.dial_type || "call",
  group_household_queue: data[0]?.group_household_queue,
  caller_id: data[0]?.caller_id,
  start_date: data[0]?.start_date,
  end_date: data[0]?.end_date,
  voicemail_file: data[0]?.voicemail_file,
  questions: data[0]?.campaignDetails?.questions,
});
const actionTypes = {
  SET_INITIAL_STATE: "SET_INITIAL_STATE",
  SET_TITLE: "SET_TITLE",
  SET_STATUS: "SET_STATUS",
  SET_TYPE: "SET_TYPE",
  SET_DIAL_TYPE: "SET_DIAL_TYPE",
  SET_GROUP_HOUSEHOLD: "SET_GROUP_HOUSEHOLD",
  SET_CALL_ID: "SET_CALL_ID",
  SET_START_DATE: "SET_START_DATE",
  SET_END_DATE: "SET_END_DATE",
  SET_VOICEMAIL: "SET_VOICEMAIL",
  SET_QUESTION: "SET_QUESTION",
};

const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.SET_INITIAL_STATE:
      return { ...action.payload };
    case actionTypes.SET_TITLE:
      return { ...state, title: action.payload };
    case actionTypes.SET_STATUS:
      return { ...state, status: action.payload };
    case actionTypes.SET_TYPE:
      return { ...state, type: action.payload };
    case actionTypes.SET_START_DATE:
      return { ...state, start_date: action.payload };
    case actionTypes.SET_END_DATE:
      return { ...state, end_date: action.payload };
    case actionTypes.SET_VOICEMAIL:
      return { ...state, voicemail_file: action.payload };
    case actionTypes.SET_DIAL_TYPE:
      return { ...state, dial_type: action.payload };
    case actionTypes.SET_GROUP_HOUSEHOLD:
      return { ...state, group_household_queue: action.payload };
    case actionTypes.SET_CALL_ID:
      return { ...state, caller_id: action.payload };
    case actionTypes.SET_QUESTION:
      return {
        ...state,
        questions: {
          ...state.questions,
          [action.payload.question]: {
            ...state.questions[action.payload.question],
            [action.payload.key]: action.payload.value,
          },
        },
      };
    default:
      return state;
  }
};

export default function CampaignScreen() {
  const { audiences } = useOutletContext();
  const {
    workspace_id,
    selected_id: campaign_id,
    data = [],
    mediaData,
  } = useLoaderData();
  const [initial, setInitial] = useState(
    initialState(data, workspace_id, campaign_id),
  );
  const [campaignDetails, dispatch] = useReducer(reducer, initial);
  const initSelectedAudiences = audiences.filter((audience) => {
    return data
      .map((row) => row.campaign_audience[0]?.audience_id)
      .includes(audience.id);
  });
  const [selectedAudiences, setSelectedAudience] = useState([
    ...initSelectedAudiences,
  ]);

  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const pageData = useMemo(() => data, [data]);
  const [isChanged, setChanged] = useState(false);
  const submit = useSubmit();

  const handleInputChange = (type, value) => {
    dispatch({ type, payload: value });
    setChanged(!deepEqual(campaignDetails, initial));
  };

  const handleAudience = ({ event, audience }) => {
    if (event.target.checked) {
      setSelectedAudience((curr) => [...curr, audience]);
    } else {
      setSelectedAudience((curr) =>
        curr.filter((aud) => aud.id !== audience.id),
      );
    }
  };

  useEffect(() => {
    const newInitialState = initialState(data, workspace_id, campaign_id);
    setInitial(newInitialState);
    dispatch({ type: actionTypes.SET_INITIAL_STATE, payload: newInitialState });
  }, [campaign_id, data, workspace_id]);

  const saveCampaign = () => {
    if (!deepEqual(campaignDetails, initial)) {
      submit(campaignDetails, {
        method: "patch",
        encType: "application/json",
        navigate: false,
        action: "/api/campaigns",
      });
      setInitial(campaignDetails);
    }
  };

  const saveAudience = () => {
    if (!deepEqual(selectedAudiences, initSelectedAudiences)) {
      submit(
        { campaign_id: campaign_id, updated: selectedAudiences },
        {
          method: "put",
          encType: "application/json",
          navigate: false,
          action: "/api/campaign_audience",
        },
      );
    }
  };
  const handleSave = () => {
    saveCampaign();
    saveAudience();
    setChanged(false)
  };

  return (
    <div>
      <div className="flex h-[80vh] w-full flex-auto overflow-scroll border-2 border-l-0 border-solid border-slate-800">
        <div className="flex flex-auto flex-col">
          <CampaignSettings
            isChanged={isChanged}
            setChanged={setChanged}
            workspace={workspace_id}
            data={pageData}
            audiences={audiences}
            mediaData={mediaData}
            campaign_id={campaign_id}
            handleInputChange={handleInputChange}
            campaignDetails={campaignDetails}
            actionTypes={actionTypes}
            selectedAudiences={selectedAudiences}
            handleAudiences={handleAudience}
          />
        </div>
      </div>
      {isChanged && (
        <div
          className="flex"
          style={{
            justifyContent: "space-between",
            position: "relative",
            background: "hsl(var(--secondary)",
            padding: "16px",
            alignItems: "center",
            top: "-74px",
            marginRight: "3px",
          }}
        >
          <div>You have unsaved changes.</div>
          <div>
            <Button onClick={handleSave}>SAVE</Button>
          </div>
        </div>
      )}
    </div>
  );
}
