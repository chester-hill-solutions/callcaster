import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
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

export default function QuestionBlockOption({ question, option, handleRemoveOption, index, handleChange, handleIconChange }) {
    const [showIcons, setShowIcons] = useState(false);
    const buttonRef = useRef(null);
    const iconContainerRef = useRef(null);
    const handleClickOutside = (event) => {
        if (iconContainerRef.current && !iconContainerRef.current.contains(event.target)) {
            setShowIcons(false);
        }
    };
    const handleIconClick = (iconName) => {
        handleIconChange({ index, iconName });
        setShowIcons(false);
    };

    const IconComponent = IconMapping[option.Icon] ? IconMapping[option.Icon] : null;
    
    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="flex gap-2" style={{ alignItems: "center" }} key={`option-${index}`}>
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
                    <button
                        ref={buttonRef}
                        className="relative flex border"
                        onClick={() => setShowIcons(!showIcons)}
                    >
                        {IconComponent && <IconComponent />}
                        <ChevronDown />
                    </button>
                    {showIcons &&
                        <div
                            ref={iconContainerRef}
                            className="absolute bg-secondary border flex"
                            style={{
                                height: "150px",
                                width: '200px',
                                flexWrap:"wrap",
                                padding: '24px',
                                boxShadow: '5px 5px 0 0 rgba(0,0,0,.7)',
                                zIndex: 1,
                            }}
                        >
                            {Object.keys(IconMapping).map((iconName) => {
                                const Icon = IconMapping[iconName];
                                return (
                                    <button
                                        value={`${iconName}`}
                                        name={`${iconName}`}
                                        key={iconName}
                                        onClick={() => handleIconClick(iconName)}
                                        className="cursor-pointer p-2 hover:bg-gray-200"
                                    >
                                        <Icon fill={'#333'} width="20px" height="20px" />
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
