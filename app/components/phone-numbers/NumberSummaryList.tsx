import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NumbersTable } from "@/components/phone-numbers/NumbersTable";
import type { User, WorkspaceNumbers } from "@/lib/types";
import {
  INBOUND_ROUTING_PRESETS,
  inferInboundRoutingPreset,
  isConservativeEmail,
  summarizeEffectiveInboundRouting,
  type InboundRoutingPresetId,
} from "../../../shared/inbound-routing-presets";

type MemberOption = Pick<NonNullable<User>, "id" | "username"> | null;
type NamedOption = { id: number; name: string };
type MediaOption = { id: number | string; name: string };

export type RoutingPresetSubmission = Record<string, string> & {
  formName: "apply-routing-preset";
  numberId: string;
  presetId: Exclude<InboundRoutingPresetId, "custom">;
};

export type NumberSummaryListProps = {
  phoneNumbers: WorkspaceNumbers[];
  users?: MemberOption[];
  mediaNames?: MediaOption[];
  queues?: NamedOption[];
  scripts?: NamedOption[];
  verifiedCallerIds?: WorkspaceNumbers[];
  isBusy: boolean;
  presetOrder?: readonly InboundRoutingPresetId[];
  onApplyPreset: (submission: RoutingPresetSubmission) => void;
  onIncomingActivityChange: (id: number, value: string) => void;
  onIncomingVoiceMessageChange: (id: number, value: string) => void;
  onCallerIdChange: (id: number, value: string) => void;
  onHandsetChange?: (id: number, enabled: boolean) => void;
  onInboundRingCountChange?: (id: number, value: string) => void;
  onInboundQueueChange?: (id: number, value: string) => void;
  onInboundScriptChange?: (id: number, value: string) => void;
  onNumberRemoval: (id: number) => void;
};

const configurablePresets = INBOUND_ROUTING_PRESETS.filter(
  (preset) => preset.id !== "custom",
);

function verificationStatus(number: NonNullable<WorkspaceNumbers>): string {
  const capabilities = number.capabilities;
  if (
    capabilities &&
    typeof capabilities === "object" &&
    !Array.isArray(capabilities) &&
    "verification_status" in capabilities
  ) {
    return String(capabilities.verification_status);
  }
  return number.type === "rented" ? "active" : "pending";
}

function orderedPresets(order?: readonly InboundRoutingPresetId[]) {
  if (!order?.length) return configurablePresets;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...configurablePresets].sort(
    (left, right) =>
      (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function PresetFields({
  number,
  presetId,
  queues,
  scripts,
  mediaNames,
  verifiedCallerIds,
}: {
  number: NonNullable<WorkspaceNumbers>;
  presetId: Exclude<InboundRoutingPresetId, "custom">;
  queues: NamedOption[];
  scripts: NamedOption[];
  mediaNames: MediaOption[];
  verifiedCallerIds: NonNullable<WorkspaceNumbers>[];
}) {
  const emailDefault =
    number.inbound_action && isConservativeEmail(number.inbound_action)
      ? number.inbound_action
      : "";
  const audioOptions = mediaNames.filter(
    (media) => !media.name.startsWith("voicemail-+"),
  );

  switch (presetId) {
    case "agent":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            name="fallbackEmail"
            type="email"
            defaultValue={emailDefault}
            placeholder="Fallback email (optional)"
            aria-label="Agent fallback email"
          />
          <select
            name="audioName"
            defaultValue={number.inbound_audio ?? ""}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Agent voicemail greeting"
          >
            <option value="">Standard greeting</option>
            {audioOptions.map((media) => (
              <option key={media.id} value={media.name}>
                {media.name}
              </option>
            ))}
          </select>
        </div>
      );
    case "queue":
      return (
        <select
          name="queueId"
          defaultValue={number.inbound_queue_id ?? ""}
          required
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Inbound queue"
        >
          <option value="">Choose a queue</option>
          {queues.map((queue) => (
            <option key={queue.id} value={queue.id}>
              {queue.name}
            </option>
          ))}
        </select>
      );
    case "automated_menu":
      return (
        <select
          name="scriptId"
          defaultValue={number.inbound_script_id ?? ""}
          required
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Automated menu script"
        >
          <option value="">Choose a script</option>
          {scripts.map((script) => (
            <option key={script.id} value={script.id}>
              {script.name}
            </option>
          ))}
        </select>
      );
    case "voicemail":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            name="notificationEmail"
            type="email"
            required
            defaultValue={emailDefault}
            placeholder="notifications@example.com"
            aria-label="Voicemail notification email"
          />
          <select
            name="audioName"
            defaultValue={number.inbound_audio ?? ""}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Voicemail greeting"
          >
            <option value="">Standard greeting</option>
            {audioOptions.map((media) => (
              <option key={media.id} value={media.name}>
                {media.name}
              </option>
            ))}
          </select>
        </div>
      );
    case "forward":
      return (
        <div className="space-y-1">
          <select
            name="phoneNumber"
            required
            disabled={verifiedCallerIds.length === 0}
            defaultValue={
              verifiedCallerIds.some(
                (callerId) => callerId.phone_number === number.inbound_action,
              )
                ? number.inbound_action ?? ""
                : ""
            }
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Forwarding phone number"
          >
            <option value="">Choose a verified caller ID</option>
            {verifiedCallerIds.map((callerId) => (
              <option key={callerId.id} value={callerId.phone_number ?? ""}>
                {callerId.friendly_name || callerId.phone_number}
              </option>
            ))}
          </select>
          {verifiedCallerIds.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              Verify a caller ID to make call forwarding available.
            </p>
          ) : null}
        </div>
      );
    case "webhook_only":
      return (
        <p className="text-sm text-muted-foreground">
          Inbound call events will be delivered to the workspace webhook.
        </p>
      );
    default: {
      const exhaustivePreset: never = presetId;
      return exhaustivePreset;
    }
  }
}

function NumberSummaryRow({
  number,
  queues,
  scripts,
  mediaNames,
  verifiedCallerIds,
  isBusy,
  presetOrder,
  onApplyPreset,
  onEdit,
}: {
  number: NonNullable<WorkspaceNumbers>;
  queues: NamedOption[];
  scripts: NamedOption[];
  mediaNames: MediaOption[];
  verifiedCallerIds: NonNullable<WorkspaceNumbers>[];
  isBusy: boolean;
  presetOrder?: readonly InboundRoutingPresetId[];
  onApplyPreset: NumberSummaryListProps["onApplyPreset"];
  onEdit: () => void;
}) {
  const inference = inferInboundRoutingPreset(number);
  const effective = summarizeEffectiveInboundRouting(number, { queues, scripts });
  const rankedPresets = orderedPresets(presetOrder);
  const initialPreset =
    inference.presetId === "custom"
      ? (rankedPresets[0]?.id as Exclude<InboundRoutingPresetId, "custom">) ??
        "agent"
      : inference.presetId;
  const [presetId, setPresetId] =
    useState<Exclude<InboundRoutingPresetId, "custom">>(initialPreset);

  if (number.type === "caller_id") {
    return (
      <Card>
        <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>{number.phone_number}</CardTitle>
            <CardDescription>{number.friendly_name}</CardDescription>
          </div>
          <Badge variant="outline">Outbound only</Badge>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Verified caller ID for outbound calls and messages.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            aria-label={`Edit ${number.phone_number ?? "phone number"}`}
          >
            Edit
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="break-words">{number.phone_number}</CardTitle>
          <CardDescription>{number.friendly_name}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{verificationStatus(number)}</Badge>
          <Badge variant={inference.presetId === "custom" ? "warning" : "secondary"}>
            {INBOUND_ROUTING_PRESETS.find((preset) => preset.id === inference.presetId)
              ?.label ?? "Custom routing"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium">{effective.label}</p>
          {effective.detail ? (
            <p className="break-words text-sm text-muted-foreground">{effective.detail}</p>
          ) : null}
          {inference.presetId === "custom" ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
              {inference.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <form
          className="space-y-3 rounded-md border bg-muted/20 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget).entries(),
            ) as Record<string, string>;
            onApplyPreset({
              ...values,
              formName: "apply-routing-preset",
              numberId: String(number.id),
              presetId,
            });
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor={`preset-${number.id}`}>
              Routing preset
            </label>
            <select
              id={`preset-${number.id}`}
              value={presetId}
              onChange={(event) =>
                setPresetId(
                  event.target.value as Exclude<InboundRoutingPresetId, "custom">,
                )
              }
              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            >
              {rankedPresets.map((preset) => (
                <option
                  key={preset.id}
                  value={preset.id}
                  disabled={
                    preset.id === "forward" && verifiedCallerIds.length === 0
                  }
                >
                  {preset.id === "forward" && verifiedCallerIds.length === 0
                    ? "Forward call — verify caller ID first"
                    : preset.label}
                </option>
              ))}
            </select>
            <Button
              type="submit"
              disabled={isBusy}
              aria-label={`Apply routing preset for ${number.phone_number ?? "phone number"}`}
            >
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onEdit}
              aria-label={`Advanced routing for ${number.phone_number ?? "phone number"}`}
            >
              Advanced
            </Button>
          </div>
          <PresetFields
            key={presetId}
            number={number}
            presetId={presetId}
            queues={queues}
            scripts={scripts}
            mediaNames={mediaNames}
            verifiedCallerIds={verifiedCallerIds}
          />
        </form>
      </CardContent>
    </Card>
  );
}

export function NumberSummaryList({
  phoneNumbers,
  users = [],
  mediaNames = [],
  queues = [],
  scripts = [],
  verifiedCallerIds: suppliedCallerIds,
  isBusy,
  presetOrder,
  onApplyPreset,
  ...tableCallbacks
}: NumberSummaryListProps) {
  const [advancedNumberId, setAdvancedNumberId] = useState<number | null>(null);
  const advancedNumber =
    phoneNumbers.find((number) => number?.id === advancedNumberId) ?? null;
  const verifiedCallerIds = (suppliedCallerIds ?? phoneNumbers).filter(
    (number): number is NonNullable<WorkspaceNumbers> =>
      number != null &&
      number.type === "caller_id" &&
      verificationStatus(number) === "success",
  );

  if (phoneNumbers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect your first phone number</CardTitle>
          <CardDescription>
            Rent a number or verify a caller ID to start calling.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <div className="grid min-w-0 gap-4">
        {phoneNumbers.map((number) =>
          number ? (
            <NumberSummaryRow
              key={number.id}
              number={number}
              queues={queues}
              scripts={scripts}
              mediaNames={mediaNames}
              verifiedCallerIds={verifiedCallerIds}
              isBusy={isBusy}
              presetOrder={presetOrder}
              onApplyPreset={onApplyPreset}
              onEdit={() => setAdvancedNumberId(number.id)}
            />
          ) : null,
        )}
      </div>
      <Sheet
        open={advancedNumber != null}
        onOpenChange={(open) => {
          if (!open) setAdvancedNumberId(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>Advanced number settings</SheetTitle>
            <SheetDescription>
              Edit individual routing fields, handset behavior, caller ID, and release controls.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 min-w-0">
            <NumbersTable
              title={advancedNumber?.phone_number ?? "Phone number"}
              phoneNumbers={advancedNumber ? [advancedNumber] : []}
              users={users}
              mediaNames={mediaNames}
              queues={queues}
              scripts={scripts}
              forwardingNumbers={verifiedCallerIds}
              isBusy={isBusy}
              hideEmptyState
              {...tableCallbacks}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
