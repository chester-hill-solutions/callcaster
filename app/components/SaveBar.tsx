import { useEffect } from 'react';
import { CheckCircleIcon, Loader2 } from 'lucide-react';
import { Button } from './ui/button';

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
    <div className="fixed left-0 right-0 top-0 z-50 flex flex-col items-center justify-between bg-primary px-4 py-3 text-white shadow-md sm:flex-row sm:px-6 sm:py-5">
      {onReset && (
        <Button
          onClick={onReset}
          className="mb-2 w-full rounded bg-white px-4 py-2 text-gray-500 transition-colors hover:bg-red-100 sm:mb-0 sm:w-auto"
          disabled={isSaving}
        >
          Reset
        </Button>
      )}
      <div className="mb-2 text-center text-lg font-semibold sm:mb-0 sm:text-left">
        {isSaving ? 'Saving changes...' : message}
      </div>
      <Button
        onClick={onSave}
        className="w-full rounded bg-secondary px-4 py-2 text-black transition-colors hover:bg-white sm:w-auto"
        disabled={isSaving}
      >
        {isSaving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
};
