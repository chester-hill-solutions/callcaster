import { useState } from "react";
import { BusyIcon, ClearIcon, FollowUpIcon, SetIcon, ThumbsDownIcon, ThumbsUpIcon, MidIcon, SignIcon, SquareCheckIcon, NoAnswerIcon } from "../../Icons";
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
    NoAnswerIcon
};

const Result = ({ action, initResult = null, questions, questionId }) => {
    const [result, setResult] = useState(initResult);

    const handleChange = (value) => {
        setResult(value);
        action({ column: questionId, value });
    };
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: 'center', gap: "16px" }}>
            <div style={{ flexBasis: "1 1 50%" }}>
                <p>{questions.title}</p>
                <p className="caption xx-small" style={{ fontSize: "xx-small" }}>{questions.text}</p>
            </div>
            <div style={{ alignItems: "unset", flexWrap: "wrap", justifyContent: "end", gap: "8px", display: "flex" }}>
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
                                style={{ display: "flex", flexDirection: "column", alignContent: "center", alignItems:'center' }}
                                value={value}
                                onClick={() => handleChange(value)}
                                type="button"
                            >
                                <IconComponent width="20px" fill={result === value ? 'hsl(var(--brand-primary))' : 'hsl(var(--muted-foreground))'} />
                                <div className="caption" style={{ fontSize: "10px", textAlign: 'center', color: result === value ? 'hsl(var(--input))' : '#ccc' }}>
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