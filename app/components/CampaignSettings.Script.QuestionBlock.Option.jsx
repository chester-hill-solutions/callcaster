import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { GrSubtractCircle } from "react-icons/gr";
import { iconMapping } from "./CallList/CallContact/Result";

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

    const IconComponent = iconMapping[option.Icon] || null;
    
    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="flex items-center gap-2 my-2" key={`option-${index}`}>
            <button 
                onClick={() => handleRemoveOption(option)}
                className="text-red-600 hover:text-red-800 transition-colors"
            >
                <GrSubtractCircle />
            </button>

            <input
                onChange={(e) => handleChange(index, e)}
                id={`${question.id}-options-${index}`}
                value={option.label}
                className="flex-grow px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            {question.type === 'radio' && (
                <div className="relative">
                    <button
                        ref={buttonRef}
                        className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                        onClick={() => setShowIcons(!showIcons)}
                    >
                        {IconComponent && <IconComponent />}
                        <ChevronDown size={16} />
                    </button>
                    
                    {showIcons && (
                        <div
                            ref={iconContainerRef}
                            className="absolute right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg flex flex-wrap p-2 z-10"
                            style={{
                                width: '240px',
                                maxHeight:"300px",
                                overflow: 'auto',
                                zIndex:50
                            }}
                        >
                            {Object.keys(iconMapping).map((iconName) => {
                                const Icon = iconMapping[iconName];
                                return (
                                    <button
                                        key={iconName}
                                        onClick={() => handleIconClick(iconName)}
                                        className="p-2 hover:bg-gray-100 rounded transition-colors h-10 w-10"
                                    >
                                        <Icon size={30}/>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}