import React, { useState } from 'react';

export const EditResponseModal = ({ isOpen, onClose, onSave, initialInput }) => {
    const [input, setInput] = useState(initialInput || '');

    const handleSave = () => {
        onSave(input);
    };

    const inputOptions = [...Array(10).keys(), 'Voice - Any'];
    return (
        isOpen && (
            <div className="absolute" style={{ zIndex: 20, transform:"translateY(40px)" }}>
                <div className="bg-white p-6 rounded-lg flex flex-col">
                    <h2 className="text-xl font-bold mb-4">Response</h2>
                    <div className='flex justify-between'>
                        <div className="mb-4">
                            <h3 className="font-medium mb-2">Input</h3>
                            <div className="flex flex-wrap gap-2"
                                style={{ width: "180px" }}>
                                {inputOptions.map((option) => (
                                    <button
                                        key={option}
                                        style={{
                                            border:"2px solid #333",
                                            height:"50px",
                                            minWidth:"50px",
                                            borderRadius:'100px',
                                            padding:"0 16px"
                                        }}

                                        onClick={() => setInput(option == 'Voice - Any' ? 'vx-any' : option.toString())}
                                        className={`${input === (option == 'Voice - Any' ? 'vx-any' : option.toString()) ? 'bg-blue-500 text-white' : ''}`}
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={onClose} className="mr-2 px-4 py-2 border rounded">Cancel</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded">Save</button>
                    </div>
                </div>
            </div>
        )
    );
};
