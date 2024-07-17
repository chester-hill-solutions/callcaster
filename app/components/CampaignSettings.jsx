import { useEffect, useState, useReducer } from "react";
import { TextInput, Dropdown, DateTime, Toggle } from "./Inputs";
import { NavLink, useNavigate, useNavigation, useSubmit } from "@remix-run/react";
import { Button } from "./ui/button";
import { deepEqual } from "~/lib/utils";

const initialState = (data, workspace, campaign_id) => ({
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
  SET_VOICEMAIL: "SET_VOICEMAIL"
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
  campaignDetails : details
}) => {
  const navigate = useNavigate();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const [initial, setInitial] = useState(
    initialState(data, workspace, campaign_id),
  );
  const [campaignDetails, dispatch] = useReducer(reducer, initial);
  const initSelectedAudiences = audiences.filter((audience) => {
    return data.campaign_audience?.audience_id === audience.id;
  });
  const [selectedAudiences, setSelectedAudience] = useState([
    ...initSelectedAudiences,
  ]);
  const [isChanged, setChanged] = useState(false);

  const handleInputChange = (type, value) => {
    dispatch({ type, payload: value });
    setChanged(!deepEqual(campaignDetails, initial));
  };

  const saveCampaign = () => {
    if (!deepEqual(campaignDetails, initial)) {
      submit({ campaignData: {...campaignDetails}, id: campaign_id, campaignDetails:details }, {
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
    setChanged(
      !deepEqual(campaignDetails, initial) ||
      !deepEqual(selectedAudiences, initSelectedAudiences),
    );
  }, [campaignDetails, initSelectedAudiences, initial, selectedAudiences]);

  useEffect(() => {
    const newInitialState = initialState(data, workspace, campaign_id);
    setInitial(newInitialState);
    dispatch({ type: actionTypes.SET_INITIAL_STATE, payload: newInitialState });
  }, [campaign_id, data, workspace]);
  return (
    <div
      id="campaignSettingsContainer"
      className="flex h-full flex-col gap-4 p-4"
    >
      {/* <div className="flex justify-between">
        <h3 className="font-Zilla-Slab text-3xl font-bold">
          {campaignDetails.title}
        </h3>
        {isChanged && (
          <Button disabled={busy} onClick={handleSave}>
            SAVE
          </Button>
        )}
      </div> */}
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
              { value: "robocall", label: "Robocall" },
              { value: "simple_ivr", label: "Simple IVR" },
              { value: "complex_ivr", label: "Complex IVR" },
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
                  {(campaignDetails.type !== 'message') && <Dropdown
                    name="voicemail"
                    label={"Voicemail File"}
                    value={campaignDetails.voicemail_file}
                    onChange={(e) =>
                      handleInputChange(
                        actionTypes.SET_VOICEMAIL,
                        e.currentTarget.value,
                      )
                    }
                    options={mediaData.map((media) => ({
                      value: media.name,
                      label: media.name,
                    }))}
                    className={"flex flex-col"}
                  />}
                </div>
                {/* <div className="flex justify-start gap-2">
          <DateTime
            name="start_date"
            label={"Start Date"}
            value={campaignDetails.start_date || new Date()}
            onChange={(e) => handleInputChange(actionTypes.SET_START_DATE, e)}
            className={"relative flex flex-col"}
          />
          <DateTime
            name="end_date"
            label={"End Date"}
            value={campaignDetails.end_date || new Date()}
            onChange={(e) => handleInputChange(actionTypes.SET_END_DATE, e)}
            className={"relative flex flex-col"}
          />
        </div> */}
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
                        checked={selectedAudiences.find(
                          (selected) => selected?.id === audience.id,
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
        export {CampaignSettings};
