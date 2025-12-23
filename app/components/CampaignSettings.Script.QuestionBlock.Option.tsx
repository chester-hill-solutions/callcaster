import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { GrSubtractCircle } from "react-icons/gr";
import { iconMapping } from "@/components/call-list/CallContact/Result.IconMap";

interface Block {
  id: string;
  type: string;
}

interface Option {
  value: string;
  content: string;
  next: string;
  Icon?: string;
}

interface ScriptData {
  pages: Record<string, { title: string; blocks: string[] }>;
  blocks: Record<string, { title: string; id: string }>;
}

interface QuestionBlockOptionProps {
  block: Block;
  option: Option;
  handleRemoveOption: (option: Option) => void;
  index: number;
  handleChange: (index: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  handleIconChange: (params: { index: number; iconName: string }) => void;
  scriptData: ScriptData;
  addNewBlock: () => Promise<string>;
  handleNextChange: (index: number, value: string) => void;
}

export default function QuestionBlockOption({ 
    block, 
    option, 
    handleRemoveOption, 
    index, 
    handleChange, 
    handleIconChange,
    scriptData,
    addNewBlock,
    handleNextChange
}: QuestionBlockOptionProps) {
    const [showIcons, setShowIcons] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const iconContainerRef = useRef<HTMLDivElement>(null);

    const handleClickOutside = (event: MouseEvent) => {
        if (iconContainerRef.current && !iconContainerRef.current.contains(event.target as Node)) {
            setShowIcons(false);
        }
    };

    const handleIconClick = (iconName: string) => {
        handleIconChange({ index, iconName });
        setShowIcons(false);
    };

    const IconComponent = option.Icon ? iconMapping[option.Icon] || null : null;

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleNextStepChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.currentTarget.value;
        if (value === "add_new_block") {
            const newBlockId = await addNewBlock();
            handleNextChange(index, newBlockId);
        } else if (value.startsWith("page_")) {
            handleNextChange(index, value);
        } else {
            handleNextChange(index, value);
        }
    };
    return (
        <div className="flex items-center gap-2 my-2" key={`option-${index}`}>
            <table>
                <thead>
                    <tr>
                        <th></th>
                        <th>Response</th>
                        <th>Next Step</th>
                        {block.type === 'radio' && <th>Icon</th>}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <button
                                onClick={() => handleRemoveOption(option)}
                                className="text-red-600 hover:text-red-800 transition-colors"
                            >
                                <GrSubtractCircle />
                            </button>
                        </td>
                        <td>
                            {option.value ? (
                                <input
                                    onChange={(e) => handleChange(index, e)}
                                    id={`${block.id}-options-${index}`}
                                    value={option.content}
                                    className="flex-grow px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            ) : (
                                <p className="flex-grow px-2 py-1">Any</p>
                            )}
                        </td>
                        <td>
                            <select
                                value={option.next}
                                onChange={handleNextStepChange}
                                className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="end">End</option>
                                {Object.entries(scriptData.pages).map(([pageId, page]) => (
                                    <optgroup key={pageId} label={page.title}>
                                        <option value={`page_${pageId}`}>Go to Page: {page.title}</option>
                                        {page.blocks.map(blockId => {
                                            const blockData = scriptData.blocks[blockId];
                                            return (
                                                <option key={blockId} value={blockId}>
                                                    {blockData.title || blockData.id}
                                                </option>
                                            );
                                        })}
                                    </optgroup>
                                ))}
                                <option value="add_new_block">Add New Block</option>
                            </select>
                        </td>
                        {block.type === 'radio' && (
                            <td>
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
                                                maxHeight: "300px",
                                                overflow: 'auto',
                                                zIndex: 50
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
                                                        <Icon size={30} />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </td>
                        )}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}