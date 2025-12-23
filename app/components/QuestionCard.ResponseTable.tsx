import React, { useState } from 'react';
import { MdEdit, MdAddCircle } from "react-icons/md";
import {EditResponseModal} from './QuestionCard.ResponseTable.EditModal';

interface Question {
  id: string;
  name: string;
  step: string;
  say: string;
  speechType: "recorded" | "synthetic";
  nextStep: Record<string, string> | null;
}

interface ResponseTableProps {
  question: Question;
  edit: boolean;
  onNextStepChange: (value: Record<string, string> | null) => void;
}

export const ResponseTable = ({ question, edit, onNextStepChange }: ResponseTableProps) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);

    const handleEdit = (key: string) => {
        setEditingKey(key);
        setIsModalOpen(true);
    };

    const handleSave = (input: string, nextAction: string) => {
        let newNextStep;
        if (input === 'none' && nextAction === 'hangup') {
            newNextStep = null;
        } else {
            newNextStep = question.nextStep ? { ...question.nextStep } : {};
            if (input !== 'none' && nextAction !== 'hangup') {
                newNextStep[input] = nextAction;
                if (editingKey && editingKey !== input) {
                    delete newNextStep[editingKey];
                }
            }
        }
        onNextStepChange(newNextStep);
        setIsModalOpen(false);
    };

    const addResponse = () => {
        setEditingKey(null);
        setIsModalOpen(true);
    };


    return (
        <div className="mt-4">
            <h3 className="text-md mb-2 font-medium">
                Response Options and Outcomes
            </h3>
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700">
                        <th className="px-4 py-2 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                            User Input
                        </th>
                        <th className="px-4 py-2 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                            Next Action
                        </th>
                        {edit && <th></th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {question.nextStep ? (
                        Object.entries(question.nextStep).map(([key, value]) => (
                            <tr key={key}>
                                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-300">
                                    {key === "vx-any" ? "Audio Response" : key}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-300">
                                    {value}
                                </td>
                                {edit && (
                                    <td className="px-4">
                                        <MdEdit onClick={() => handleEdit(key)} className="cursor-pointer" />
                                    </td>
                                )}
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-300">
                                <span className="uppercase">NONE</span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-300">
                                <span className="uppercase">HANGUP</span>
                            </td>
                            {edit && (
                                <td className="px-4">
                                    <MdEdit onClick={() => handleEdit('none')} className="cursor-pointer" />
                                </td>
                            )}
                        </tr>
                    )}
                    {edit && (
                        <tr>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-300" colSpan={2}>
                                <span className="uppercase">ADD RESPONSE</span>
                            </td>
                            <td className="px-4">
                                <MdAddCircle onClick={addResponse} className="cursor-pointer" />
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            {isModalOpen && (
                <EditResponseModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSave}
                    initialInput={editingKey}
                    initialNextAction={question.nextStep?.[editingKey || ''] || 'hangup'}
                />
            )}
        </div>
    );
};

export default ResponseTable;