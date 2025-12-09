import React from 'react';

export const ScriptOrAudio = ({ question, edit, mediaNames, onScriptChange, onAudioChange, navigate }) => {
    return (
        <div className="mb-4">
            <h3 className="text-md mb-2 font-medium">
                {question.speechType === "synthetic" ? "Script" : "Audio"}
            </h3>
            {edit ? (
                <div className="w-full">
                    {question.speechType === "synthetic" ? (
                        <div className="w-full">
                            <textarea 
                                rows={Math.max(3, Math.ceil(question.say.length / 40))} 
                                value={question.say} 
                                className="w-full p-3 border rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                                onChange={(e) => onScriptChange(e.target.value)}
                                style={{
                                    lineHeight: '1.5',
                                    fontSize: '14px',
                                }}
                            />
                        </div>
                    ) : (
                        <div>
                            <select 
                                value={question.say} 
                                className="w-full p-2 border rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                onChange={(e) => e.target.value === "Add" ? navigate('../../../../audios') : onAudioChange(e.target.value)}
                            >
                                {mediaNames.map((link) => (
                                    <option key={link.name} value={link.name}>{link.name}</option>
                                ))}
                                <option value={"Add"}>Add an audio file</option>
                            </select>
                        </div>
                    )}
                </div>
            ) : question.speechType === "synthetic" ? (
                <p className="p-3 bg-gray-100 p-4 dark:bg-gray-800 rounded-md text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                    {question.say}
                </p>
            ) : (
                <audio
                    src={question.say}
                    controls
                    className="w-full"
                />
            )}
        </div>
    );
};