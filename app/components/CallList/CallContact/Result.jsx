import { useEffect, useState, useCallback } from "react";
import { BusyIcon, ClearIcon, FollowUpIcon, SetIcon, ThumbsDownIcon, ThumbsUpIcon, MidIcon, SignIcon, SquareCheckIcon, NoAnswerIcon } from "../../Icons";
import SupportButton from "./SupportButton";

// Mapping of icon names to actual icon components
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

const Result = ({ action, initResult = null, questions, questionId, disabled }) => {
    const [result, setResult] = useState(initResult || "");
    const [multiResult, setMultiResult] = useState(initResult || []);
    
    useEffect(() => {
        setResult(initResult || "");
        setMultiResult(initResult || []);
    }, [initResult]);

    const handleChange = (id, value) => {
        setResult(value);
        action({ column: id, value });
    };

    const handleMultiChange = (id, value, isChecked) => {
        let newArr = [];
        if (isChecked) {
            newArr = [...multiResult, value];
        } else {
            newArr = multiResult.filter(item => item !== value);
        }
        setMultiResult(newArr);
        action({ column: id, value: newArr });
    };

    return (
        <div className="flex flex-col gap-2">
            <div>
                <p className="font-Zilla-Slab text-xl">{questions.title}</p>
                <p className="">{questions.text}</p>
            </div>
            {questions.type !== 'textblock' &&
                <div className="flex flex-auto wrap gap-2">
                    {questions.type === 'radio' && questions.options.map(({ Icon, value, label }) => {

                        if (Icon === 'SupportButton') {
                            return (
                                <SupportButton
                                    key={value}
                                    option={{ Icon, value, label }}
                                    handleChange={() => handleChange(questions.id, value)}
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
                                    style={{ display: "flex", flexDirection: "column", alignContent: "center", alignItems: 'center', minWidth: "40px" }}
                                    value={value}
                                    onClick={() => handleChange(questions.id, value)}
                                    type="button"
                                >
                                    <IconComponent width="20px" fill={result === value ? 'hsl(var(--brand-primary))' : 'hsl(var(--muted-foreground))'} />
                                    <div className="caption" style={{ fontSize: "10px", textAlign: 'center', color: result === value ? 'hsl(var(--primary))' : '#333' }}>
                                        {label}
                                    </div>
                                </button>
                            );
                        }
                    })}
                    {questions.type === 'boolean' && (
                        <div className="flex items-center justify-between gap-2">
                            <label htmlFor={questions.title}>
                                {questions.title}
                            </label>
                            <input id={questions.title} type="checkbox" name={questions.title} onChange={(e) => handleChange(questions.id, e.target.checked)} checked={result}></input>
                        </div>
                    )}
                    {questions.type === 'dropdown' && (
                        <select name={questions.title} value={result} onChange={(e) => handleChange(questions.id, e.currentTarget.value)} className="px-2 py-1">
                            <option value={null} key={`question-${questionId}-select-DEFAULT`}>
                                ---
                            </option>

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
                                const inputId = `${questionId}-select-${value}`;
                                return (
                                    <div key={inputId} className="flex items-center justify-between gap-2">
                                        <label htmlFor={inputId} className="ml-2">{label}</label>
                                        <input
                                            id={inputId}
                                            name={inputId}
                                            type="checkbox"
                                            onChange={(e) => handleMultiChange(questions.id, value, e.target.checked)}
                                            checked={multiResult.includes(value)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {questions.type === 'textarea' && (
                        <div className="flex items-center justify-between gap-2">
                            <textarea
                                type="textarea"
                                rows={2}
                                placeholder="Notes/Key Issues"
                                onChange={(e) => handleChange(questions.id, e.target.value)}
                                value={result}
                                key={`question-${questionId}-notes`}
                            />
                        </div>
                    )}
                </div>}
        </div>
    );
};

export default Result;
