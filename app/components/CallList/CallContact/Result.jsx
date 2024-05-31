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
    const handleMultiChange = (value) => {

        setResult([...result, value]);
        action({ column: questionId, ...[...result, value] });
    };
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: 'center', gap: "16px" }}>
            <div style={{ flexBasis: "1 1 50%" }}>
                <p>{questions.title}</p>
                <p className="caption xx-small" style={{ fontSize: "xx-small" }}>{questions.text}</p>
            </div>
            <div style={{ alignItems: "unset", flexWrap: "wrap", justifyContent: "end", gap: "8px", display: "flex" }}>
                {questions.type === 'radio' && questions.options.map(({ Icon, value, label }) => {

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
                                style={{ display: "flex", flexDirection: "column", alignContent: "center", alignItems: 'center' }}
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
                {questions.type === 'boolean' && (
                    <input type="checkbox" name={questions.title} onChange={handleChange}></input>
                )}
                {questions.type === 'dropdown' && (
                    <select name={questions.title} onChange={handleChange} className="px-2 py-1">
                        {questions.options.map(({ value, label }) => {
                            return (
                                <option value={value} key={`question-${questionId}-select-${value}`}>
                                    {label}
                                </option>
                            )
                        })}
                    </select>
                )}
                {questions.type === 'multi' && (
                    <div>
                        {questions.options.map(({ value, label }) => {
                            return (
                                <div key={`multiselect-${questionId}-${value}`} className="flex">
                                    <input type="checkbox" onChange={handleMultiChange} value={value} key={`question-${questionId}-select-${value}`} />
                                    <p>{label}</p>
                                </div>
                            )
                        })}
                    </div>
                )}
                {questions.type === 'textarea' && (
                    <div>
                        <textarea type="textarea" rows={2} placeholder="Notes/Key Issues" onChange={handleMultiChange} value={result} key={`question-${questionId}-notes`} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default Result;