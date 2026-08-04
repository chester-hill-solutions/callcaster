import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

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
  /**
   * @effect Wire a global Cmd/Ctrl+S keyboard shortcut to trigger onSave while there are unsaved changes.
   * @effect-deps isChanged, isSaving, onSave — the handler must see current values to guard the save and avoid double-submits.
   * @effect-side-effects dom (document keydown listener; removed on cleanup/re-run)
   * @effect-why-not-loader A global keyboard shortcut requires a document-level event listener; there's no loader/fetcher equivalent for DOM key events.
   */
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
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b bg-background px-4 py-2">
      <span className="text-sm">{message}</span>
      <div className="flex gap-2">
        {onReset && (
          <Button
            onClick={onReset}
            variant="ghost"
            size="sm"
            disabled={isSaving}
          >
            Reset
          </Button>
        )}
        <Button onClick={onSave} size="sm" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
};
