import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type EditableTitleProps = {
  value: string;
  onSave: (value: string) => void;
  readOnly?: boolean;
  autoEdit?: boolean;
  onAutoEditConsumed?: () => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  as?: "div" | "span";
};

export function EditableTitle({
  value,
  onSave,
  readOnly = false,
  autoEdit = false,
  onAutoEditConsumed,
  ariaLabel,
  placeholder = "Untitled",
  className,
  as = "div",
}: EditableTitleProps) {
  const [editing, setEditing] = useState(autoEdit && !readOnly);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoEditConsumedRef = useRef(false);

  /**
   * @effect Keep the draft aligned with external title changes while not editing.
   * @effect-deps editing, value
   * @effect-side-effects local component state only
   * @effect-why-not-loader The title is local interactive editor state.
   */
  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [editing, value]);

  /**
   * @effect Focus and select the title input when edit mode starts.
   * @effect-deps autoEdit, editing, onAutoEditConsumed
   * @effect-side-effects dom focus and text selection only
   * @effect-why-not-loader This is client-only focus behavior.
   */
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
      if (autoEdit && !autoEditConsumedRef.current) {
        autoEditConsumedRef.current = true;
        onAutoEditConsumed?.();
      }
    }
  }, [autoEdit, editing, onAutoEditConsumed]);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft(value);
    setEditing(false);
  };

  const save = () => {
    onSave(draft);
    setEditing(false);
  };

  if (readOnly) {
    return (
      <span className={cn("min-w-0 truncate font-medium", className)}>
        {value || placeholder}
      </span>
    );
  }

  const TitleContainer = as;

  return (
    <TitleContainer className={cn("flex min-w-0 items-center gap-1", className)}>
      {editing ? (
        <Input
          ref={inputRef}
          value={draft}
          aria-label={ariaLabel}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") cancelEditing();
          }}
        />
      ) : (
        <span className="min-w-0 truncate font-medium" title={value || placeholder}>
          {value || placeholder}
        </span>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={editing ? `Save ${ariaLabel.toLowerCase()}` : `Edit ${ariaLabel.toLowerCase()}`}
        title={editing ? `Save ${ariaLabel.toLowerCase()}` : `Edit ${ariaLabel.toLowerCase()}`}
        onClick={editing ? save : startEditing}
      >
        {editing ? <Check className="h-4 w-4" aria-hidden /> : <Pencil className="h-4 w-4" aria-hidden />}
      </Button>
      {editing && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Cancel editing ${ariaLabel.toLowerCase()}`}
          title={`Cancel editing ${ariaLabel.toLowerCase()}`}
          onClick={cancelEditing}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </TitleContainer>
  );
}
