import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { GrSubtractCircle } from "react-icons/gr";
import { BusyIcon, ClearIcon, FollowUpIcon, SetIcon, ThumbsDownIcon, ThumbsUpIcon, MidIcon, SignIcon, SquareCheckIcon, NoAnswerIcon } from "./Icons";

const IconMapping = {
    BusyIcon,
    ClearIcon,
    FollowUpIcon,
    SetIcon,
    ThumbsDownIcon,
    ThumbsUpIcon,
    MidIcon,
    SignIcon,
    SquareCheckIcon,
    NoAnswerIcon
};

export default function QuestionBlockOption({ question, option, handleRemoveOption, index, handleChange }) {
    const [showIcons, setShowIcons] = useState(false);

    const handleIconClick = (iconName) => {
        handleChange(index, { target: { value: option.label, name: iconName } });
        setShowIcons(false);
    };

    const IconComponent = IconMapping[option.Icon] ? IconMapping[option.Icon] : null;

    return (
        <div
            className="flex gap-2"
            style={{ alignItems: "center" }}
            key={`option-${index}`}
        >
            <button onClick={() => handleRemoveOption(option)}>
                <GrSubtractCircle />
            </button>

            <input
                onChange={(e) => handleChange(index, e)}
                id={`${question.id}-options-${index}`}
                value={option.label}
            />
            {question.type === 'radio' &&
                <>
                    <button className="flex border relative" onClick={() => setShowIcons(!showIcons)}>
                        {IconComponent && <IconComponent />}
                        <ChevronDown />
                    </button>
                    {showIcons &&
                        <div className="absolute bg-secondary border mt-2 flex flex-wrap" style={{height:"150px", width:'200px', padding:'24px', boxShadow:'5px 5px 0 0 rgba(0,0,0,.7)'}}>
                            {Object.keys(IconMapping).map((iconName) => {
                                const Icon = IconMapping[iconName];
                                return (
                                    <button
                                        key={iconName}
                                        onClick={() => handleIconClick(iconName)}
                                        className="cursor-pointer p-2 hover:bg-gray-200"
                                    >
                                        <Icon fill={'#333'} width="20px" height="20px"/>
                                    </button>
                                );
                            })}
                        </div>
                    }
                </>
            }
        </div>
    );
}
