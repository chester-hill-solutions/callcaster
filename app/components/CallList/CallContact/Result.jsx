import { useState } from "react";
import { BusyIcon, ClearIcon, FollowUpIcon, SetIcon, ThumbsDownIcon, ThumbsUpIcon, MidIcon, SignIcon, SquareCheckIcon } from "../../Icons";
import SupportButton from "./SupportButton";

const iconMapping = {
    BusyIcon,
    ClearIcon,
    FollowUpIcon,
    SetIcon,
    ThumbsDownIcon,
    ThumbsUpIcon,
    MidIcon,
    SupportButton,
    SignIcon,
    SquareCheckIcon,
};

const Result = ({ action, initResult = null, questions }) => {
    const [result, setResult] = useState(initResult);

    const handleChange = (value) => {
        setResult(value);
        action({ column: 'result', value });
    };

    return (
        <div className="row justify-space-between flex align-center">
            <div className="flex-half">
                <p>{questions.title}</p>
                <p className="caption xx-small">{questions.text}</p>
            </div>
            <div className="row xx-small justify-end gap1" style={{ alignItems: "unset", flexWrap: "wrap" }}>
                {questions.options.map(({ Icon, value, label }) => {

                    if (Icon === 'SupportButton') {
                        return (
                            <SupportButton
                                key={value}
                                option={{ Icon, value, label }}
                                handleChange={handleChange}
                                current={result}
                            />
                        );
                    } else {
                        const IconComponent = iconMapping[Icon];

                        if (!IconComponent) {
                            console.error(`Icon component ${Icon} is not found in iconMapping`);
                            return null;
                        }

                        return (
                            <button
                                key={value}
                                className="result-button column align-center justify-start"
                                value={value}
                                onClick={() => handleChange(value)}
                                type="button"
                            >
                                <IconComponent width="20px" fill={result === value ? 'var(--yellow)' : '#ccc'} />
                                <div className="caption" style={{ fontSize: "10px", textAlign: 'center', color: result === value ? 'var(--yellow)' : '#ccc' }}>
                                    {label}
                                </div>
                            </button>
                        );
                    }
                })}
            </div>
        </div>
    );
};

export default Result;