import React from 'react';
import { FaInbox, FaPlus } from 'react-icons/fa';
import { Button } from '~/components/ui/button';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = <FaInbox size={48} />,
  action
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <div className="text-gray-400 mb-4">
        {icon}
      </div>
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-gray-500 mb-4">{description}</p>
      {action && (
        <Button onClick={action.onClick} className="flex items-center gap-2">
          <FaPlus size={14} />
          {action.label}
        </Button>
      )}
    </div>
  );
};