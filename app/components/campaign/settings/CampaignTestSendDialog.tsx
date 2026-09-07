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

export type CampaignTestKind = "message" | "call";

const COPY: Record<
  CampaignTestKind,
  { title: string; description: string; hint: string; submit: string; busy: string }
> = {
  message: {
    title: "Send a test message",
    description:
      "Sends this campaign's message to one number using the campaign's sending settings. Credits are charged as usual and the test does not appear in campaign results.",
    hint:
      "If the number belongs to a contact in this workspace, tags render with that contact's details. Otherwise a sample contact is used.",
    submit: "Send test",
    busy: "Sending...",
  },
  call: {
    title: "Place a test call",
    description:
      "Calls one number from this campaign's caller ID and plays the campaign's flow, so you can hear it and walk the menu. Credits are charged as usual and the call does not appear in campaign results.",
    hint: "Answer to hear the flow. Let it ring through to voicemail to hear the voicemail drop.",
    submit: "Place test call",
    busy: "Calling...",
  },
};

export type CampaignTestSendDialogProps = {
  open: boolean;
  busy: boolean;
  kind?: CampaignTestKind;
  onOpenChange: (open: boolean) => void;
  onSend: (phone: string) => void;
};

export function CampaignTestSendDialog({
  open,
  busy,
  kind = "message",
  onOpenChange,
  onSend,
}: CampaignTestSendDialogProps) {
  const copy = COPY[kind];
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
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
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
            <p className="text-xs text-muted-foreground">{copy.hint}</p>
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
              {busy ? copy.busy : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
