import React, { useState, useRef } from 'react';
import { MdBubbleChart, MdMic, MdArrowDropDown } from 'react-icons/md';
import { useClickOutside } from '@/hooks/utils/useClickOutside';

interface VoxTypeSelectorProps {
  value: "recorded" | "synthetic";
  onChange: (value: "recorded" | "synthetic") => void;
}

interface RadioButtonProps {
  id: string;
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

export const VoxTypeSelector = ({ value, onChange }: VoxTypeSelectorProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useClickOutside(dropdownRef, () => setIsOpen(false));

    const handleChange = (type: "recorded" | "synthetic") => {
        onChange(type);
        setIsOpen(false);
    };

    const toggleDropdown = () => setIsOpen(!isOpen);

    return (
        <div className="relative w-[120px]" ref={dropdownRef} style={{zIndex:"10"}}>
            <button
                type="button"
                className="flex items-center justify-between p-2 border-2 rounded-lg cursor-pointer bg-opacity-75 bg-white "
                onClick={toggleDropdown}
            >
                {value === 'synthetic' ? <MdBubbleChart size={24} /> : <MdMic size={24} />}
                <span className="ml-2 text-xs font-semibold uppercase">{value}</span>
                <MdArrowDropDown size={24} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className={`absolute top-full left-0 w-full mt-1 bg-white border-2 rounded-lg overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <RadioButton
                    id="synthetic"
                    selected={value === 'synthetic'}
                    onClick={() => handleChange('synthetic')}
                    icon={<MdBubbleChart size={24} />}
                    label="SYNTHETIC"
                />
                <RadioButton
                    id="recorded"
                    selected={value === 'recorded'}
                    onClick={() => handleChange('recorded')}
                    icon={<MdMic size={24} />}
                    label="RECORDED"
                />
            </div>
        </div>
    );
};

const RadioButton = ({ id, selected, onClick, icon, label }: RadioButtonProps) => (
    <button
        type="button"
        className={`flex items-center p-2 cursor-pointer transition-colors duration-200 ${
            selected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
        }`}
        onClick={onClick}
    >
        {icon}
        <span className="ml-2 text-xs font-semibold uppercase">{label}</span>
    </button>
);
