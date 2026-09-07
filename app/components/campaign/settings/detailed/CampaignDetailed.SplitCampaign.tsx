import { useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useFetcherOnIdle } from "@/hooks/utils";
import { isBulkSmsSenderMisaligned } from "@/lib/throughput-config";
import type { TwilioSmsSenderClass } from "@/lib/types";

/**
 * Phase F (Q32/Q36) — parallel-campaign split prompt.
 *
 * When a message campaign has a large queue on a Canadian local (long-code)
 * number (`isBulkSmsSenderMisaligned` — ca_local queue >= 500), carriers
 * throttle the bulk send and delivery suffers. This surfaces a CTA + wizard to
 * clone the campaign into evenly-sized parallel segments (with a copy-variation
 * checklist) and distribute the queued contacts across them. Submitting posts
 * `intent=split` to the campaign settings action, which calls
 * `splitMessageCampaign`. Returns null when the campaign is not misaligned, so
 * callers can render it unconditionally.
 */

type SplitActionData = {
  success?: boolean;
  actionType?: string;
  error?: string;
  segments?: { campaignId: number; title: string; contactCount: number }[];
  movedContactCount?: number;
  enabled?: boolean;
};

const OVERRIDE_ACKNOWLEDGEMENT =
  "I understand carriers may throttle or filter this send and that delivery on a local number at this volume is my responsibility.";

const COPY_VARIATION_CHECKLIST = [
  "Vary the opening line or greeting between segments.",
  "Reword the call-to-action so segments aren't identical.",
  "Rotate link wording or use per-segment tracking links.",
];

/** Aim for ~500 contacts per segment (the ca_local bulk threshold); minimum 2. */
function defaultSegmentCount(queueCount: number): number {
  return Math.max(2, Math.ceil(queueCount / 500));
}

/** Shown in place of the safeguard once an admin has overridden it (#1482). */
function BulkLocalOverrideActiveNotice({
  queueCount,
  disabled,
  onRemove,
}: {
  queueCount: number;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <Alert className="border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20">
      <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
      <AlertTitle>Bulk-send safeguard overridden</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          An admin chose to send {queueCount.toLocaleString()} queued contacts
          on a Canadian local (long-code) number. Carriers may throttle or
          filter this send.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onRemove}>
          Remove override
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** The deliberate confirmation behind "Send on this local number anyway" (#1482). */
function BulkLocalOverrideDialog({
  open,
  onOpenChange,
  acknowledged,
  onAcknowledgedChange,
  isSubmitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  acknowledged: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
  isSubmitting: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send on a local number at this volume?</DialogTitle>
          <DialogDescription>
            The safeguard stays on by default. Overriding it for this campaign
            is deliberate and recorded, and you can remove it before starting.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
            className="mt-0.5"
          />
          <span>{OVERRIDE_ACKNOWLEDGEMENT}</span>
        </label>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={!acknowledged || isSubmitting} onClick={onConfirm}>
            {isSubmitting ? "Saving…" : "Override and allow this send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SplitCampaignPrompt({
  queueCount,
  senderClass,
  disabled = false,
  overrideActive = false,
}: {
  queueCount: number;
  senderClass: TwilioSmsSenderClass;
  disabled?: boolean;
  /** The campaign carries an admin's explicit bulk-on-local override (#1482). */
  overrideActive?: boolean;
}) {
  const fetcher = useFetcher<SplitActionData>();
  const [open, setOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);
  const [segmentCount, setSegmentCount] = useState(() =>
    defaultSegmentCount(queueCount),
  );
  const [acknowledged, setAcknowledged] = useState(false);

  const isSubmitting = fetcher.state !== "idle";

  useFetcherOnIdle(fetcher, (data) => {
    if (!data) {
      return;
    }
    if (data.success && data.actionType === "split") {
      const count = data.segments?.length ?? segmentCount;
      const moved = data.movedContactCount ?? 0;
      toast.success(
        `Split into ${count} campaign${count === 1 ? "" : "s"} — ${moved.toLocaleString()} contact${moved === 1 ? "" : "s"} distributed.`,
      );
      setOpen(false);
      setAcknowledged(false);
    } else if (data.actionType === "split" && data.error) {
      toast.error(data.error);
    } else if (data.actionType === "bulk_local_override") {
      if (data.success) {
        toast.success(
          data.enabled
            ? "Override saved. This campaign can start on its local number."
            : "Override removed. The bulk-send safeguard applies again.",
        );
        setOverrideOpen(false);
        setOverrideAcknowledged(false);
      } else if (data.error) {
        toast.error(data.error);
      }
    }
  });

  if (!isBulkSmsSenderMisaligned(senderClass, queueCount)) {
    return null;
  }

  const setOverride = (enabled: boolean) => {
    fetcher.submit(
      { intent: "bulk_local_override", enabled: String(enabled) },
      { method: "post" },
    );
  };

  if (overrideActive) {
    return (
      <BulkLocalOverrideActiveNotice
        queueCount={queueCount}
        disabled={disabled || isSubmitting}
        onRemove={() => setOverride(false)}
      />
    );
  }

  const perSegment = Math.ceil(queueCount / Math.max(2, segmentCount));

  return (
    <Alert className="border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20">
      <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
      <AlertTitle>Large bulk send on a local number</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          This campaign has {queueCount.toLocaleString()} queued contacts on a
          Canadian local (long-code) number. Carriers throttle high-volume sends
          on local numbers, which hurts delivery. Split it into smaller parallel
          campaigns with varied copy, or switch to a verified toll-free number.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setSegmentCount(defaultSegmentCount(queueCount));
              setOpen(true);
            }}
          >
            Split into {defaultSegmentCount(queueCount)} campaigns
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setOverrideOpen(true)}
          >
            Send on this local number anyway
          </Button>
        </div>
      </AlertDescription>

      <BulkLocalOverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        acknowledged={overrideAcknowledged}
        onAcknowledgedChange={setOverrideAcknowledged}
        isSubmitting={isSubmitting}
        onConfirm={() => setOverride(true)}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Split this campaign</SheetTitle>
            <SheetDescription>
              Clone this campaign into evenly-sized segments and distribute the
              queued contacts across them. Vary the copy per segment so carriers
              don&apos;t flag the batches as identical bulk traffic.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="split-segment-count">Number of segments</Label>
              <Input
                id="split-segment-count"
                type="number"
                min={2}
                max={Math.max(2, queueCount)}
                value={segmentCount}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setSegmentCount(
                    Number.isFinite(next) ? Math.max(2, Math.floor(next)) : 2,
                  );
                }}
                className="max-w-[8rem]"
              />
              <p className="text-xs text-muted-foreground">
                ~{perSegment.toLocaleString()} contacts per segment.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Copy-variation checklist</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {COPY_VARIATION_CHECKLIST.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-2 pt-1 text-sm">
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={(checked) => setAcknowledged(checked === true)}
                  className="mt-0.5"
                />
                <span>
                  I&apos;ll vary the message copy across the {segmentCount}{" "}
                  segments before sending.
                </span>
              </label>
            </div>
          </div>

          <SheetFooter className="gap-2 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!acknowledged || isSubmitting || segmentCount < 2}
              onClick={() => {
                fetcher.submit(
                  { intent: "split", segmentCount: String(segmentCount) },
                  { method: "post" },
                );
              }}
            >
              {isSubmitting
                ? "Splitting…"
                : `Split into ${segmentCount} campaigns`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Alert>
  );
}
