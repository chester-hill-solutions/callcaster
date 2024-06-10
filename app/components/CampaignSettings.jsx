import { useReducer } from "react";
import { TextInput, Dropdown, DateTime, DragOver } from "./Inputs";
import { ImportIcon } from "lucide-react";
import { useNavigate, useSubmit } from "@remix-run/react";
import { Button } from "./ui/button";

const initialState = (data) => ({
    title: data[0].campaign.title,
    status: data[0].campaign.status,
    type: data[0].campaign.type,
    start_date: data[0].campaign.start_date,
    end_date: data[0].campaign.end_date,
    voicemail: data[0].campaignDetails.voicemail,
    questions: data[0].campaignDetails.questions,
});

const actionTypes = {
    SET_TITLE: 'SET_TITLE',
    SET_STATUS: 'SET_STATUS',
    SET_TYPE: 'SET_TYPE',
    SET_START_DATE: 'SET_START_DATE',
    SET_END_DATE: 'SET_END_DATE',
    SET_VOICEMAIL: 'SET_VOICEMAIL',
    SET_QUESTION: 'SET_QUESTION',
};

const reducer = (state, action) => {
    switch (action.type) {
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
    const submit = useSubmit();
    const navigate = useNavigate();
    const [campaignDetails, dispatch] = useReducer(reducer, initialState(data));

    const selectedAudiences = data.map((i) => {
        return audiences.find((audience) => audience.id === i.audience_id);
    });

    const handleInputChange = (type, value) => {
        dispatch({ type, payload: value });
    };

    const uploadVoicemail = (file) => {
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('campaign_name', campaignDetails.title);
            formData.append('live_campaign_id', data[0].campaignDetails.id);
            submit(formData, { method: 'post', encType: 'multipart/form-data', action: "/api/media", navigate: false });
        }
    }

    return (
        <div className="p-4 flex-col">
            <div className="flex justify-between px-4">
                <h3 className="font-Zilla-Slab text-2xl">{campaignDetails.title}</h3>
                <Button onClick={() => navigate('call')}>
                    Start Calling
                </Button>
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
                        options={new Array("pending", "running", 'complete', "paused")}
                        className={"flex flex-col"}
                    />

                    <Dropdown
                        name="type"
                        label={"Campaign Type"}
                        value={campaignDetails.type}
                        onChange={(e) => handleInputChange(actionTypes.SET_TYPE, e.currentTarget.value)}
                        options={new Array("message", "robocall", 'simple_ivr', "complex_ivr", "live_call")}
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
                    <DragOver
                        handleDropContent={uploadVoicemail}
                        Icon={ImportIcon}
                        name="voicemail"
                        label={"Voicemail File"}
                        title={"IMPORT"}
                        value={campaignDetails.voicemail}
                    />
                </div>
                {/*  <div>
                Questions:
                {Object.keys(campaignDetails.questions)
                    .sort((a, b) => campaignDetails.questions[a].order - campaignDetails.questions[b].order)
                    .map((question) => {
                        const thisQuestions = campaignDetails.questions[question];
                        return (
                            <div key={`campaign-question-${question}`}>
                                {thisQuestions.order} {question}
                                {Object.keys(thisQuestions).map((key) => {
                                    return (
                                        <div key={`campaign-questions-${question}-${key}`}>
                                            <div>- {key}</div>
                                            <input
                                                type="text"
                                                value={thisQuestions[key]}
                                                onChange={(e) =>
                                                    dispatch({
                                                        type: actionTypes.SET_QUESTION,
                                                        payload: { question, key, value: e.target.value },
                                                    })
                                                }
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
            </div> */}
                <div>
                    Audiences:
                    {selectedAudiences.filter(Boolean).map((audience) => (
                        <div key={audience.id}>
                            {audience.name || `Unnamed Audience ${audience.id}`}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export { CampaignSettings };
