import { useReducer, useEffect, useState } from "react";
import { TextInput, Dropdown, DateTime, Toggle } from "./Inputs";
import { useNavigate, useNavigation, useSubmit } from "@remix-run/react";
import { Button } from "./ui/button";
import { deepEqual } from "~/lib/utils";

const initialState = (data) => ({
    campaign_id: data[0]?.campaign.id,
    workspace: data[0]?.campaignDetails.workspace,
    title: data[0]?.campaign.title,
    status: data[0]?.campaign.status,
    type: data[0]?.campaign.type || 'live_call',
    dial_type: data[0]?.campaign.dial_type || 'call', 
    group_household_queue: data[0]?.campaign.group_household_queue,
    caller_id: data[0]?.campaign.caller_id,
    start_date: data[0]?.campaign.start_date,
    end_date: data[0]?.campaign.end_date,
    voicemail: data[0]?.campaignDetails.voicemail,
    questions: data[0]?.campaignDetails.questions,
});

const actionTypes = {
    SET_INITIAL_STATE: 'SET_INITIAL_STATE',
    SET_TITLE: 'SET_TITLE',
    SET_STATUS: 'SET_STATUS',
    SET_TYPE: 'SET_TYPE',
    SET_DIAL_TYPE: 'SET_DIAL_TYPE',
    SET_GROUP_HOUSEHOLD: 'SET_GROUP_HOUSEHOLD',
    SET_CALL_ID: 'SET_CALL_ID',
    SET_START_DATE: 'SET_START_DATE',
    SET_END_DATE: 'SET_END_DATE',
    SET_VOICEMAIL: 'SET_VOICEMAIL',
    SET_QUESTION: 'SET_QUESTION',
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
            return { ...state, voicemail: action.payload };
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

const CampaignSettings = ({ data, audiences }) => {
    const navigate = useNavigate();
    const nav = useNavigation();
    const busy = (nav.state !== 'idle');
    const submit = useSubmit();
    const [initial, setInitial] = useState(initialState(data));
    const [campaignDetails, dispatch] = useReducer(reducer, initial);
    const selectedAudiences = data.map((i) => audiences?.find((audience) => audience.id === i.audience_id));
    const [isChanged, setChanged] = useState(false);

    const handleInputChange = (type, value) => {
        dispatch({ type, payload: value });
        setChanged(!deepEqual(campaignDetails, initial));
    };

    const handleSave = () => {
        if (!deepEqual(campaignDetails, initial)) {
            submit(campaignDetails, {
                method: "patch",
                encType: "application/json",
                navigate: false,
                action: "/api/campaigns"
            });
            setInitial(campaignDetails);
            setChanged(false);
        }
    };

    useEffect(() => {
        setChanged(!deepEqual(campaignDetails, initial));
    }, [campaignDetails, initial]);

    useEffect(() => {
        const newInitialState = initialState(data);
        setInitial(newInitialState);
        dispatch({ type: actionTypes.SET_INITIAL_STATE, payload: newInitialState });
    }, [data]);

    return (
        <div className="p-4 flex-col">
            <div className="flex justify-between px-4" style={{ height: "40px" }}>
                <h3 className="font-Zilla-Slab text-2xl">{campaignDetails.title}</h3>
                {isChanged && <Button disabled={busy} onClick={handleSave}>SAVE</Button>}
            </div>
            <div className="gap-2 flex-col flex">
                <div className="flex justify-start gap-2">
                    <TextInput
                        name="title"
                        label={'Campaign Title'}
                        value={campaignDetails.title}
                        onChange={(e) => handleInputChange(actionTypes.SET_TITLE, e.target.value)}
                        className={"flex flex-col"}
                    />
                    <Dropdown
                        name="status"
                        label={"Campaign Status"}
                        value={campaignDetails.status}
                        onChange={(e) => handleInputChange(actionTypes.SET_STATUS, e.currentTarget.value)}
                        options={["pending", "running", 'complete', "paused"]}
                        className={"flex flex-col"}
                    />
                    <Dropdown
                        name="type"
                        disabled
                        label={"Campaign Type"}
                        value={campaignDetails.type}
                        onChange={(e) => handleInputChange(actionTypes.SET_TYPE, e.currentTarget.value)}
                        options={["message", "robocall", 'simple_ivr', "complex_ivr", "live_call"]}
                        className={"flex flex-col"}
                    />
                </div>
                <div className="flex justify-start gap-2">
                    <DateTime
                        name="start_date"
                        label={"Start Date"}
                        value={campaignDetails.start_date || new Date()}
                        onChange={(e) => handleInputChange(actionTypes.SET_START_DATE, e)}
                        className={"flex flex-col relative"}
                    />
                    <DateTime
                        name="end_date"
                        label={"End Date"}
                        value={campaignDetails.end_date || new Date()}
                        onChange={(e) => handleInputChange(actionTypes.SET_END_DATE, e)}
                        className={"flex flex-col relative"}
                    />
                </div>
                <div className="flex justify-start gap-2">
                    <Toggle
                        name={"group_household_queue"}
                        label={"Group by household"}
                        isChecked={campaignDetails.group_household_queue}
                        onChange={(e) => handleInputChange(actionTypes.SET_GROUP_HOUSEHOLD, e)}
                        rightLabel="Yes"
                    />
                </div>
                <div className="justify-start flex gap-2">
                    <Toggle
                        name={"dial_type"}
                        label={"Dial Type"}
                        isChecked={campaignDetails.dial_type === 'predictive'}
                        onChange={(e) => handleInputChange(actionTypes.SET_DIAL_TYPE, e === true ? 'predictive' : 'call')}
                        leftLabel="Power Dialer"
                        rightLabel="Predictive Dialer"
                    />
                </div>
                <div>
                    Audiences:
                    {audiences.filter(Boolean).map((audience) => (
                        <div key={audience.id} className="flex gap-2">
                            <input type="checkbox" id={`${audience.id}-audience-select`} checked={selectedAudiences.includes(audience)} onChange={(event) => handleAudience({event, audience})} />
                            <label htmlFor={`${audience.id}-audience-select`}>{audience.name || `Unnamed Audience ${audience.id}`}</label>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end">
                    <Button onClick={() => navigate(`${campaignDetails.dial_type}`)}>
                        Start Calling
                    </Button>
                </div>
            </div>
        </div>
    );
};

export { CampaignSettings };
