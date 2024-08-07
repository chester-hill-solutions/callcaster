import { useEffect, useState, useReducer, useCallback } from "react";
import { TextInput, Dropdown, DateTime, Toggle } from "./Inputs";
import { NavLink, useNavigate, useNavigation, useSubmit } from "@remix-run/react";
import { Button } from "./ui/button";
import { deepEqual } from "~/lib/utils";
import { MdAdd } from "react-icons/md";

const initialState = (data, workspace, campaign_id, script_id) => ({
  campaign_id,
  workspace,
  title: data?.title,
  status: data?.status,
  type: data?.type || "live_call",
  dial_type: data?.dial_type || "call",
  group_household_queue: data?.group_household_queue,
  start_date: data?.start_date,
  end_date: data?.end_date,
  caller_id: data?.caller_id,
  voicemail_file: data?.voicemail_file,
  questions: data?.campaignDetails?.questions,
  audiences: data?.campaign_audience ? [...data.campaign_audience] : [],
  script_id: script_id
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
  SET_AUDIENCES: "SET_AUDIENCES",
  SET_SCRIPT: "SET_SCRIPT",

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
    case actionTypes.SET_AUDIENCES:
      return { ...state, audiences: action.payload };
    case actionTypes.SET_SCRIPT:
      return { ...state, script_id: action.payload };
    default:
      return state;
  }
};

const CampaignSettings = ({
  campaign_id,
  data,
  audiences = [],
  mediaData,
  workspace,
  phoneNumbers = [],
  campaignDetails: details,
  onPageDataChange,
  scripts
}) => {
  const navigate = useNavigate();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const [initial, setInitial] = useState(
    initialState(data, workspace, campaign_id, details.script_id),
  );
  const [campaignDetails, dispatch] = useReducer(reducer, initialState(data, workspace, campaign_id, details.script_id));
  const initSelectedAudiences = audiences.filter((audience) => {
    return data.campaign_audience?.audience_id === audience.id;
  });
  const [isChanged, setChanged] = useState(false);

  const handleInputChange = (type, value) => {
    dispatch({ type, payload: value });
    setChanged(!deepEqual(campaignDetails, initial));
  };

  const saveAudience = () => {
    submit(
      { campaign_id: campaign_id, updated: campaignDetails.audiences },
      {
        method: "put",
        encType: "application/json",
        navigate: false,
        action: "/api/campaign_audience",
      },
    );
  };

  const handleSave = () => {
    if (isChanged) {
      const updates = {
        campaignData: { ...campaignDetails },
        id: campaign_id,
        campaignDetails: details,
      };
      if (!deepEqual(campaignDetails.audiences, initial.audiences)) {
        updates.updatedAudiences = campaignDetails.audiences;
        saveAudience();
      }

      submit(updates, {
        method: "patch",
        encType: "application/json",
        navigate: false,
        action: "/api/campaigns",
      });

      setInitial(campaignDetails);
      setChanged(false);
    }
  };

  const handleAudience = ({ event, audience }) => {
    const updatedAudiences = event.target.checked
      ? [...campaignDetails.audiences, { audience_id: audience.id, campaign_id: parseInt(campaign_id), created_at: audience.created_at }]
      : campaignDetails.audiences.filter((aud) => aud.id !== audience.audience_id);
    dispatch({ type: actionTypes.SET_AUDIENCES, payload: updatedAudiences });
  };

  useEffect(() => {
    setChanged(
      !deepEqual(campaignDetails, initial)
    );
  }, [campaignDetails, initial]);

  useEffect(() => {
    const newInitialState = initialState(data, workspace, campaign_id, details.script_id);
    setInitial(newInitialState);
    dispatch({ type: actionTypes.SET_INITIAL_STATE, payload: newInitialState });
  }, [campaign_id, data, workspace]);

  return (
    <div
      id="campaignSettingsContainer"
      className="flex h-full flex-col gap-4 p-4"
    >
      <div className="flex flex-col gap-2">
        <div className="flex justify-start gap-2 flex-wrap">
          <TextInput
            name="title"
            label={"Campaign Title"}
            value={campaignDetails.title || ""}
            onChange={(e) =>
              handleInputChange(actionTypes.SET_TITLE, e.target.value)
            }
            className={"flex flex-col"}
          />
          <Dropdown
            name="status"
            label={"Campaign Status"}
            value={campaignDetails.status || ""}
            onChange={(e) =>
              handleInputChange(actionTypes.SET_STATUS, e.currentTarget.value)
            }
            options={[
              { value: "pending", label: "Pending" },
              { value: "running", label: "Running" },
              { value: "complete", label: "Complete" },
              { value: "paused", label: "Paused" },
              { value: "draft", label: "Draft" },
            ]}
            className={"flex flex-col"}
          />
          <Dropdown
            name="type"
            disabled
            label={"Campaign Type"}
            value={campaignDetails.type}
            onChange={(e) =>
              handleInputChange(actionTypes.SET_TYPE, e.currentTarget.value)
            }
            options={[
              { value: "message", label: "Message" },
              { value: "robocall", label: "Interactive Voice Recording" },
              { value: "live_call", label: "Live Call" },
            ]}
            className={"flex flex-col"}
          />
          {
            phoneNumbers.length ? <Dropdown
              name="caller_id"
              className={"flex flex-col"}
              label={"Phone Number"}
              value={campaignDetails.caller_id}
              onChange={(e) =>
                handleInputChange(actionTypes.SET_CALL_ID, e.currentTarget.value)
              }
              options={phoneNumbers.map((number) => ({
                value: number.phone_number,
                label: number.friendly_name
              }))}
            /> :
              <div className="flex flex-col justify-end">
                <Button asChild>
                  <NavLink to={"../../../settings/numbers"}>Get a Number</NavLink>
                </Button>
              </div>
          }
          {(campaignDetails.type !== 'message') && (
            <div className="flex gap-2">
              <div className="flex items-end gap-1">
                <Dropdown
                  name="voicemail"
                  label={"Voicemail File"}
                  value={campaignDetails.voicemail_file}
                  onChange={(e) =>
                    handleInputChange(
                      actionTypes.SET_VOICEMAIL,
                      e.currentTarget.value,
                    )
                  }
                  options={mediaData?.map((media) => ({
                    value: media.name,
                    label: media.name,
                  }))}
                  className={"flex flex-col"}
                />
                <Button variant="outline" asChild><NavLink to={"../../../audios/new"}><MdAdd /></NavLink></Button>
              </div>
              <div className="flex items-end gap-1">

                <Dropdown
                  name="script"
                  label={"Script"}
                  value={campaignDetails.script_id}
                  onChange={(e) =>
                    handleInputChange(
                      actionTypes.SET_SCRIPT,
                      e.currentTarget.value,
                    )
                  }
                  options={scripts?.map((script) => ({
                    value: script.id,
                    label: script.name,
                  }))}
                  className={"flex flex-col"}
                />
                <Button variant="outline" asChild><NavLink to={"../script/edit"}><MdAdd /></NavLink></Button>
              </div>
            </div>
          )}
        </div>

        {campaignDetails.type === 'live_call' && <>
          <div className="mb-4 w-full border-b-2 border-zinc-300 py-2 dark:border-zinc-600" /><div className="flex justify-start gap-8">
            <Toggle
              name={"group_household_queue"}
              label={"Group by household"}
              isChecked={campaignDetails.group_household_queue}
              onChange={(e) => handleInputChange(actionTypes.SET_GROUP_HOUSEHOLD, e)}
              rightLabel="Yes" />

            <Toggle
              name={"dial_type"}
              label={"Dial Type"}
              isChecked={campaignDetails.dial_type === "predictive"}
              onChange={(e) => handleInputChange(
                actionTypes.SET_DIAL_TYPE,
                e === true ? "predictive" : "call"
              )}
              leftLabel="Power Dialer"
              rightLabel="Predictive Dialer" />
          </div></>}
        <div className="mb-4 w-full border-b-2 border-zinc-300 py-2 dark:border-zinc-600" />
        <span className="text-lg font-semibold">Audiences:</span>
        {audiences.filter(Boolean).map((audience) => {
          return (
            <div key={audience.id} className="flex gap-2">
              <input
                type="checkbox"
                id={`${audience.id}-audience-select`}
                checked={campaignDetails.audiences.find(
                  (selected) => {
                    return selected?.audience_id === audience.id
                  },
                )}
                onChange={(event) => handleAudience({ event, audience })}
              />
              <label htmlFor={`${audience.id}-audience-select`}>
                {audience.name || `Unnamed Audience ${audience.id}`}
              </label>
            </div>
          );
        })}
        <NavLink to={'../audiences/new'} relative="path">
          Add an audience
        </NavLink>
        <div className="mt-2 flex justify-end">
          <Button
            className="text-xl font-semibold uppercase disabled:bg-zinc-400"
            disabled={busy || !isChanged}
            onClick={handleSave}
          >
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
};
export { CampaignSettings };
