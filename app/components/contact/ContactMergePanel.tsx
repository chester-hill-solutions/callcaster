import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Section, SectionHeader } from "@/components/shared/Section";
import type {
  ContactMergeProfile,
  ContactMergeResult,
  ContactMergeReview,
} from "@/lib/contact-merge";

type MergeResponse = {
  mergeReview?: ContactMergeReview;
  mergeResult?: ContactMergeResult;
  error?: string;
};
type Props = {
  workspaceId: string;
  contactId: number;
  candidates: ContactMergeProfile[];
  disabled?: boolean;
  initialResult?: ContactMergeResult;
};

const FIELD_LABELS: Record<string, string> = {
  firstname: "First name",
  surname: "Last name",
  email: "Email",
  address: "Address",
  city: "City",
  province: "Province",
  postal: "Postal code",
  country: "Country",
  external_id: "External ID",
  voter_id: "Voter ID",
  household_id: "Household",
  support_level: "Support level",
  other_data: "Other data",
  line_type: "Phone line type",
  voter_list_source: "Voter list source",
  voter_list_imported_at: "Voter list import date",
  voter_list_expires_at: "Voter list expiry date",
};
const EFFECT_LABELS: Record<keyof ContactMergeReview["effects"], string> = {
  audiences: "Call lists",
  queues: "Campaign queue entries",
  calls: "Calls",
  messages: "Messages",
  outreachAttempts: "Outreach attempts",
  surveyResponses: "Survey responses",
  importReceipts: "Import source receipts",
  continuations: "Call continuations",
};
function name(profile: ContactMergeProfile) {
  return (
    [profile.firstname, profile.surname].filter(Boolean).join(" ") ||
    `Contact ${profile.id}`
  );
}
function value(input: unknown): string {
  return input == null || input === ""
    ? "Empty"
    : typeof input === "object"
      ? JSON.stringify(input)
      : String(input);
}

export function ContactMergePanel({
  workspaceId,
  contactId,
  candidates,
  disabled,
  initialResult,
}: Props) {
  const fetcher = useFetcher<MergeResponse>();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [retainedId, setRetainedId] = useState(contactId);
  const [confirmed, setConfirmed] = useState(false);
  const busy = fetcher.state !== "idle";
  const blocked = disabled || busy;
  const result = initialResult ?? fetcher.data?.mergeResult;
  const offered = fetcher.data?.mergeReview;
  const review =
    offered?.retainedContactId === retainedId &&
    JSON.stringify(
      offered.contacts.map((row) => row.id).sort((a, b) => a - b),
    ) === JSON.stringify([...selected].sort((a, b) => a - b))
      ? offered
      : undefined;

  if (result)
    return (
      <Section>
        <SectionHeader title="Contact merge complete" />
        <p role="status">
          Merged {result.mergedCount} duplicate{" "}
          {result.mergedCount === 1 ? "record" : "records"}. The saved profile
          and history are ready to review.
        </p>
        <Link
          to={`/workspaces/${workspaceId}/contacts/${result.retainedContactId}`}
        >
          Open retained contact
        </Link>
      </Section>
    );
  if (candidates.length < 2) return null;
  return (
    <Section>
      <SectionHeader title="Records with the same phone" />
      <p>
        People can share a phone number. Merge records only when you have
        checked that they are the same person.
      </p>
      {!open ? (
        <Button
          variant="outline"
          disabled={blocked}
          onClick={() => setOpen(true)}
        >
          Review duplicate records
        </Button>
      ) : (
        <div className="space-y-4">
          {disabled && (
            <p>Save or reset your profile changes before you merge records.</p>
          )}
          <fieldset disabled={blocked} className="space-y-3">
            <legend>
              Select 2 to 20 records, then choose the profile to keep.
            </legend>
            {candidates.map((profile) => (
              <div key={profile.id} className="rounded-md border p-3">
                <Checkbox
                  checked={selected.includes(profile.id)}
                  onCheckedChange={(checked) => {
                    setSelected((current) =>
                      checked
                        ? [...current, profile.id]
                        : current.filter((id) => id !== profile.id),
                    );
                    setConfirmed(false);
                  }}
                >
                  Include {name(profile)} (#{profile.id})
                </Checkbox>
                <p className="text-muted-foreground text-sm">
                  {profile.phone} · External ID:{" "}
                  {profile.external_id || "Empty"} · Voter ID:{" "}
                  {profile.voter_id || "Empty"} ·{" "}
                  {profile.opt_out ? "Opted out" : "No saved opt-out"}
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="retained-contact"
                    checked={retainedId === profile.id}
                    disabled={!selected.includes(profile.id)}
                    onChange={() => {
                      setRetainedId(profile.id);
                      setConfirmed(false);
                    }}
                  />
                  Keep profile #{profile.id}
                </label>
              </div>
            ))}
          </fieldset>
          <Button
            disabled={
              blocked ||
              selected.length < 2 ||
              selected.length > 20 ||
              !selected.includes(retainedId)
            }
            onClick={() => {
              setConfirmed(false);
              void fetcher.submit(
                {
                  intent: "preview-contact-merge",
                  merge_contact_ids: JSON.stringify(selected),
                },
                {
                  method: "post",
                  action: `/workspaces/${workspaceId}/contacts/${retainedId}`,
                },
              );
            }}
          >
            {busy ? "Checking records..." : "Review merge"}
          </Button>
          {fetcher.data?.error && <p role="alert">{fetcher.data.error}</p>}
          {review && (
            <MergeReview
              review={review}
              confirmed={confirmed}
              blocked={blocked}
              busy={busy}
              onConfirmedChange={setConfirmed}
              onConfirm={() => {
                void fetcher.submit(
                  {
                    intent: "merge-contacts",
                    merge_contact_ids: JSON.stringify(selected),
                    merge_version: review.version,
                    merge_request_id: review.requestId,
                    confirm_same_person: "yes",
                  },
                  {
                    method: "post",
                    action: `/workspaces/${workspaceId}/contacts/${retainedId}`,
                  },
                );
              }}
            />
          )}
        </div>
      )}
    </Section>
  );
}

function MergeReview({
  review,
  confirmed,
  blocked,
  busy,
  onConfirmedChange,
  onConfirm,
}: {
  review: ContactMergeReview;
  confirmed: boolean;
  blocked?: boolean;
  busy: boolean;
  onConfirmedChange: (value: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-4 rounded-md border p-4">
      <h3 className="font-semibold">
        Keep profile #{review.retainedContactId}
      </h3>
      <p>
        The selected profile values stay. The original profiles are saved in a
        merge receipt. Call lists and history will move to the retained contact.
        Import source receipts stay unchanged.
      </p>
      <p>
        {review.optedOut
          ? "The merged contact will stay opted out."
          : "No selected record has a saved opt-out."}{" "}
        Different saved phone line types will be checked again before SMS.
      </p>
      {review.conflictingFields.length > 0 && (
        <div>
          <h4 className="font-semibold">Compare different profile values</h4>
          {review.contacts.map((profile) => (
            <div key={profile.id} className="mt-2">
              <h5>
                {name(profile)} (#{profile.id})
                {profile.id === review.retainedContactId
                  ? " — keep these values"
                  : ""}
              </h5>
              <dl>
                {Object.entries(profile)
                  .filter(([field]) => review.conflictingFields.includes(field))
                  .map(([field, input]) => (
                    <div
                      key={field}
                      className="grid grid-cols-2 gap-2 break-words text-sm"
                    >
                      <dt>{FIELD_LABELS[field] ?? field}</dt>
                      <dd>{value(input)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ))}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        {Object.entries(review.effects).map(([field, count]) => (
          <div key={field}>
            <dt>{EFFECT_LABELS[field as keyof typeof EFFECT_LABELS]}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
      <FormField description="Use this only for duplicate records of one person. Keep different people separate, even if they share this phone.">
        <Checkbox
          checked={confirmed}
          disabled={blocked}
          onCheckedChange={onConfirmedChange}
        >
          I checked these records. They are the same person.
        </Checkbox>
      </FormField>
      <Button disabled={blocked || !confirmed} onClick={onConfirm}>
        {busy ? "Merging..." : "Confirm merge"}
      </Button>
    </div>
  );
}
