import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LAST_NUMBER_KEY = "callcaster:test-send-number";

function readLastNumber(): string {
  try {
    return window.localStorage.getItem(LAST_NUMBER_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberNumber(value: string) {
  try {
    window.localStorage.setItem(LAST_NUMBER_KEY, value);
  } catch {
    // Storage can be unavailable; the number is only a convenience.
  }
}

export type CampaignTestSendDialogProps = {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (phone: string) => void;
};

export function CampaignTestSendDialog({
  open,
  busy,
  onOpenChange,
  onSend,
}: CampaignTestSendDialogProps) {
  const [phone, setPhone] = useState(readLastNumber);
  const trimmed = phone.trim();

  const submit = () => {
    if (!trimmed || busy) return;
    rememberNumber(trimmed);
    onSend(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Send a test message</DialogTitle>
            <DialogDescription>
              Sends this campaign&apos;s message to one number using the campaign&apos;s
              sending settings. Credits are charged as usual and the test does not
              appear in campaign results.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 flex flex-col gap-2">
            <Label htmlFor="campaign-test-send-phone">Phone number</Label>
            <Input
              id="campaign-test-send-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+1 613 555 0199"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              If the number belongs to a contact in this workspace, tags render
              with that contact&apos;s details. Otherwise a sample contact is used.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="mr-2"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !trimmed} data-testid="campaign-test-send-submit">
              {busy ? "Sending..." : "Send test"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
