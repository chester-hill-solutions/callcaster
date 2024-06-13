import { useEffect, useState } from "react";
import { TextInput, Dropdown, DateTime, Toggle } from "./Inputs";
import { useNavigate } from "@remix-run/react";
import { Button } from "./ui/button";
import { deepEqual } from "~/lib/utils";
import CampaignSettingsScript from "./CampaignSettings.Script";

const CampaignSettings = ({
    audiences,
    mediaData,
    setChanged,
    handleInputChange,
    campaignDetails,
    actionTypes,
    selectedAudiences,
    handleAudience
}) => {
    const navigate = useNavigate();

    return (
        <div className="p-4 flex-col">
            <div className="flex justify-between px-4" style={{ height: "40px" }}>
                <h3 className="font-Zilla-Slab text-2xl">{campaignDetails.title}</h3>
                <Button onClick={() => navigate(`${campaignDetails.dial_type}`)}>
                    Start Calling
                </Button>
            </div>
            <div className="gap-2 flex-col flex">
                <div className="flex justify-start gap-2">
                    <TextInput
                        name="title"
                        label={'Campaign Title'}
                        value={campaignDetails.title || ''}
                        onChange={(e) => handleInputChange(actionTypes.SET_TITLE, e.target.value)}
                        className={"flex flex-col"}
                    />
                    <Dropdown
                        name="status"
                        label={"Campaign Status"}
                        value={campaignDetails.status || ''}
                        onChange={(e) => handleInputChange(actionTypes.SET_STATUS, e.currentTarget.value)}
                        options={[
                            { value: "pending", label: "Pending" },
                            { value: "running", label: "Running" },
                            { value: "complete", label: "Complete" },
                            { value: "paused", label: "Paused" }
                        ]}
                        className={"flex flex-col"}
                    />
                    <Dropdown
                        name="type"
                        disabled
                        label={"Campaign Type"}
                        value={campaignDetails.type}
                        onChange={(e) => handleInputChange(actionTypes.SET_TYPE, e.currentTarget.value)}
                        options={[
                            { value: "message", label: "Message" },
                            { value: "robocall", label: "Robocall" },
                            { value: 'simple_ivr', label: "Simple IVR" },
                            { value: "complex_ivr", label: "Complex IVR" },
                            { value: "live_call", label: "Live Call" }
                        ]}
                        className={"flex flex-col"}
                    />
                    <Dropdown
                        name="voicemail"
                        label={"Voicemail File"}
                        value={campaignDetails.voicemail_file}
                        onChange={(e) => handleInputChange(actionTypes.SET_VOICEMAIL, e.currentTarget.value)}
                        options={mediaData?.map((media) => ({ value: media.name, label: media.name }))}
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
                Audiences:
                {audiences.filter(Boolean).map((audience) => {
                    return (
                        <div key={audience.id} className="flex gap-2">
                            <input
                                type="checkbox"
                                id={`${audience.id}-audience-select`}
                                checked={selectedAudiences.find((selected) => selected?.id === audience.id)}
                                onChange={(event) => handleAudience({ event, audience })}
                            />
                            <label htmlFor={`${audience.id}-audience-select`}>
                                {audience.name || `Unnamed Audience ${audience.id}`}
                            </label>
                        </div>
                    )
                })}
                <CampaignSettingsScript {...{questions: campaignDetails.questions, setChanged}}/>
            </div>
        </div>
    );
};

export { CampaignSettings };
