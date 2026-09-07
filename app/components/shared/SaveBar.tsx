import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface SaveBarProps {
  isChanged: boolean;
  onSave: () => void;
  onReset?: () => void;
  isSaving?: boolean;
  message?: string;
  /**
   * Where the bar sticks. A form long enough to scroll shows one at each end
   * so the actions are always in reach (#1128); only the top bar owns the
   * Cmd/Ctrl+S shortcut so two bars never double-submit.
   */
  placement?: 'top' | 'bottom';
}

export const SaveBar = ({
  isChanged,
  onSave,
  onReset,
  isSaving = false,
  message = 'You have unsaved changes',
  placement = 'top',
}: SaveBarProps) => {
  /**
   * @effect Wire a global Cmd/Ctrl+S keyboard shortcut to trigger onSave while there are unsaved changes.
   * @effect-deps isChanged, isSaving, onSave — the handler must see current values to guard the save and avoid double-submits.
   * @effect-side-effects dom (document keydown listener; removed on cleanup/re-run)
   * @effect-why-not-loader A global keyboard shortcut requires a document-level event listener; there's no loader/fetcher equivalent for DOM key events.
   */
  useEffect(() => {
    if (placement !== 'top') return;
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
  }, [isChanged, isSaving, onSave, placement]);

  if (!isChanged && !isSaving) return null;

  const stick =
    placement === 'bottom' ? 'sticky bottom-0 border-t' : 'sticky top-0 border-b';

  return (
    <div
      className={`${stick} z-50 flex items-center justify-between gap-3 bg-background px-4 py-2`}
      data-placement={placement}
    >
      <span className="text-sm">{message}</span>
      <div className="flex gap-2">
        {onReset && (
          <Button
            onClick={onReset}
            variant="ghost"
            size="sm"
            disabled={isSaving}
          >
            Discard changes
          </Button>
        )}
        <Button onClick={onSave} size="sm" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
};
