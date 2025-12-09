import { useEffect } from 'react';
import { Button } from '~/components/ui/button';

interface SaveBarProps {
  isChanged: boolean;
  onSave: () => void;
  onReset?: () => void;
  isSaving?: boolean;
  message?: string;
}

export const SaveBar = ({
  isChanged,
  onSave,
  onReset,
  isSaving = false,
  message = 'You have unsaved changes'
}: SaveBarProps) => {
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (isChanged && !isSaving) {
          onSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isChanged, isSaving, onSave]);

  if (!isChanged && !isSaving) return null;

  return (
    <div className="sticky top-0 z-50 bg-white border-b px-4 py-2 flex items-center justify-between">
      <span className="text-sm">{message}</span>
      <div className="flex gap-2">
        {onReset && (
          <Button
            onClick={onReset}
            variant="ghost"
            size="sm"
          >
            Reset
          </Button>
        )}
        <Button
          onClick={onSave}
          size="sm"
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};
