import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EditResponseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: string, nextAction: string) => void;
  initialInput: string | null;
  initialNextAction?: string;
}

const INPUT_OPTIONS = [...Array(10).keys(), "Voice - Any"] as const;

const NEXT_ACTION_OPTIONS = [
  { value: "hangup", label: "Hangup" },
  { value: "next", label: "Next Question" },
  { value: "voicemail", label: "Voicemail" },
] as const;

export const EditResponseModal = ({
  isOpen,
  onClose,
  onSave,
  initialInput,
  initialNextAction = "hangup",
}: EditResponseModalProps) => {
  const [input, setInput] = useState(initialInput || "");
  const [nextAction, setNextAction] = useState(initialNextAction);

  /**
   * @effect Reset the edit form to the row being edited whenever the dialog opens or its seed values change.
   * @effect-deps isOpen (only reset while open); initialInput / initialNextAction (row values from the parent table)
   * @effect-side-effects none — local controlled-input state only
   * @effect-why-not-loader Dialog draft state is ephemeral UI; loaders cannot seed per-open modal drafts.
   */
  useEffect(() => {
    if (!isOpen) return;
    setInput(initialInput || "");
    setNextAction(initialNextAction);
  }, [initialInput, initialNextAction, isOpen]);

  const handleSave = () => {
    onSave(input, nextAction);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="ivr-edit-response-dialog"
      >
        <DialogHeader>
          <DialogTitle>Response</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FormField label="Input" htmlFor="ivr-response-input">
            <div
              id="ivr-response-input"
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Input"
            >
              {INPUT_OPTIONS.map((option) => {
                const optionValue =
                  option === "Voice - Any" ? "vx-any" : option.toString();
                const isSelected = input === optionValue;

                return (
                  <Button
                    key={option}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    aria-pressed={isSelected}
                    onClick={() => setInput(optionValue)}
                    className="h-[50px] min-w-[50px] rounded-full px-4"
                  >
                    {option}
                  </Button>
                );
              })}
            </div>
          </FormField>

          <FormField label="Next Action" htmlFor="ivr-response-next-action">
            <Select value={nextAction} onValueChange={setNextAction}>
              <SelectTrigger id="ivr-response-next-action">
                <SelectValue placeholder="Select next action" />
              </SelectTrigger>
              <SelectContent>
                {NEXT_ACTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
