import { useEffect, useState } from "react";

import {
    MdAccessAlarm, MdAccessibility, MdAccessTime, MdAccountBalanceWallet, MdAddLocation,
    MdAddShoppingCart, MdAdd, MdArrowBack, MdArrowUpward, MdArrowForward, MdArrowDownward,
    MdCheck, MdError, MdFlashOn, MdFlight, MdHttps, MdInsertLink, MdSchool, MdTouchApp,
    MdShare, MdSkipNext, MdSkipPrevious, MdSpellcheck, MdVolumeDown, MdVolumeUp, MdWarning,
    MdThumbDown, MdThumbUp, MdTimeToLeave, MdThumbsUpDown, MdSupervisorAccount, MdSms, MdSmsFailed,
    MdNoteAdd, MdNotificationImportant, MdNotInterested, MdOfflinePin, MdNature, MdLooksOne, MdLooksTwo,
    MdLooks3, MdLooks4, MdLooks5, MdLooks6, MdHearing
} from "react-icons/md";

import SupportButton from "./SupportButton";

export const iconMapping = {
    AccessAlarm: MdAccessAlarm,
    Accessibility: MdAccessibility,
    AccessTime: MdAccessTime,
    AccountBalanceWallet: MdAccountBalanceWallet,
    AddLocation: MdAddLocation,
    AddShoppingCart: MdAddShoppingCart,
    Add: MdAdd,
    ArrowBack: MdArrowBack,
    ArrowUpward: MdArrowUpward,
    ArrowForward: MdArrowForward,
    ArrowDownward: MdArrowDownward,
    Check: MdCheck,
    Error: MdError,
    FlashOn: MdFlashOn,
    Flight: MdFlight,
    Hearing: MdHearing,
    Https: MdHttps,
    InsertLink: MdInsertLink,
    School: MdSchool,
    TouchApp: MdTouchApp,
    Share: MdShare,
    SkipNext: MdSkipNext,
    SkipPrevious: MdSkipPrevious,
    Spellcheck: MdSpellcheck,
    VolumeDown: MdVolumeDown,
    VolumeUp: MdVolumeUp,
    Warning: MdWarning,
    ThumbDown: MdThumbDown,
    ThumbUp: MdThumbUp,
    TimeToLeave: MdTimeToLeave,
    ThumbsUpDown: MdThumbsUpDown,
    SupervisorAccount: MdSupervisorAccount,
    Sms: MdSms,
    SmsFailed: MdSmsFailed,
    NoteAdd: MdNoteAdd,
    NotificationImportant: MdNotificationImportant,
    NotInterested: MdNotInterested,
    OfflinePin: MdOfflinePin,
    Nature: MdNature,
    LooksOne: MdLooksOne,
    LooksTwo: MdLooksTwo,
    Looks3: MdLooks3,
    Looks4: MdLooks4,
    Looks5: MdLooks5,
    Looks6: MdLooks6,
};
const Result = ({ action, initResult = null, questions, questionId, disabled }) => {
    const [result, setResult] = useState(initResult || "");
    const [multiResult, setMultiResult] = useState(initResult || []);

    useEffect(() => {
        setResult(initResult || "");
        setMultiResult(initResult || []);
    }, [initResult]);

    const handleChange = (id, value) => {
        const newValue = result === value ? "" : value;
        setResult(newValue);
        action({ column: id, value: newValue });
    };

    const handleMultiChange = (id, value, isChecked) => {
        const newArr = isChecked
            ? [...multiResult, value]
            : multiResult.filter(item => item !== value);
        setMultiResult(newArr);
        action({ column: id, value: newArr });
    };

    const renderIcon = (Icon, value, label) => {
        const IconComponent = iconMapping[Icon];
        if (!IconComponent) {
            //console.error(`Icon component ${Icon} is not found in iconMapping`);
            return (<SupportButton
                key={value}
                option={{ Icon, value, label }}
                handleChange={() => handleChange(questions.id, value)}
                current={result}
            />)
        }

        return (
            <button
                key={value}
                className="result-button column align-center justify-start"
                style={{ display: "flex", flexDirection: "column", alignItems: 'center', minWidth: "40px" }}
                onClick={() => handleChange(questions.id, value)}
                type="button"
            >
                <IconComponent size="20px" color={result === value ? 'hsl(var(--brand-primary))' : 'hsl(var(--muted-foreground))'} />
                <div className="caption" style={{ fontSize: "10px", textAlign: 'center', color: result === value ? 'hsl(var(--primary))' : '#333' }}>
                    {label}
                </div>
            </button>
        );
    };

    const renderQuestionContent = () => {
        switch (questions.type) {
            case 'radio':
                return questions.options.map(({ Icon, value, label }) =>
                    Icon === 'SupportButton'
                        ? <SupportButton
                            key={value}
                            option={{ Icon, value, label }}
                            handleChange={() => handleChange(questions.id, value)}
                            current={result}
                        />
                        : renderIcon(Icon, value, label)
                );
            case 'boolean':
                return (
                    <div className="flex items-center justify-between gap-2">
                        <label htmlFor={questions.title}>{questions.text}</label>
                        <input
                            id={questions.title}
                            type="checkbox"
                            name={questions.title}
                            onChange={(e) => handleChange(questions.id, e.target.checked)}
                            checked={result}
                        />
                    </div>
                );
            case 'dropdown':
                return (
                    <select
                        name={questions.title}
                        value={result}
                        onChange={(e) => handleChange(questions.id, e.currentTarget.value)}
                        className="px-2 py-1"
                    >
                        <option value="">---</option>
                        {questions.options.map(({ value, label }) => (
                            <option key={`question-${questionId}-select-${value}`} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                );
            case 'multi':
                return questions.options.map(({ value, label }) => {
                    const inputId = `${questionId}-select-${value}`;
                    return (
                        <div key={inputId} className="flex items-center justify-between gap-2">
                            <input
                                id={inputId}
                                name={inputId}
                                type="checkbox"
                                onChange={(e) => handleMultiChange(questions.id, value, e.target.checked)}
                                checked={multiResult.includes(value)}
                            />
                            <label htmlFor={inputId} className="ml-2">{label}</label>
                        </div>
                    );
                });
            case 'textarea':
                return (
                    <textarea
                        rows={2}
                        placeholder="Notes/Key Issues"
                        onChange={(e) => handleChange(questions.id, e.target.value)}
                        value={result}
                        key={`question-${questionId}-notes`}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div>
                <p className="">{questions.type !== 'boolean' && questions.text}</p>
            </div>
            {questions.type !== 'textblock' && (
                <div className="flex flex-auto wrap gap-2">
                    {renderQuestionContent()}
                </div>
            )}
        </div>
    );
};

export default Result;