export { loader } from "./setup.loader.server";
export { action } from "./setup.action.server";

import { useState } from "react";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useParams,
} from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/ui/page-shell";
import { Section } from "@/components/shared/Section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/typography";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";

type Greeting = {
  id: number | string;
  name: string;
  signed_url: string | null;
};

type NumberOption = {
  id: number;
  phone_number: string | null;
  friendly_name: string | null;
  inbound_audio: string | null;
  currentRouting: string | null;
  routingWouldChange: boolean;
};

type Member = {
  id: string;
  email: string;
  name: string;
};

type LoaderData = {
  numbers: NumberOption[];
  members: Member[];
  greetings: Greeting[];
  error: string | null;
};

export default function VoicemailSetupPage() {
  const { numbers, members, greetings, error } = useLoaderData<LoaderData>();
  const actionData = useActionData<{ error?: string }>();
  const { state } = useNavigation();
  const params = useParams();
  const workspaceId = params.id;

  const [source, setSource] = useState<"existing" | "upload">(
    greetings.length > 0 ? "existing" : "upload",
  );
  const [pendingFileName, setPendingFileName] = useState("");

  const hasNumbers = numbers.length > 0;

  return (
    <PageShell
      title="Set up voicemail"
      description="Choose the greeting callers hear when nobody picks up, then pick which numbers play it. Callers' messages land on the Voicemails page."
      maxWidth="narrow"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {actionData?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{actionData.error}</AlertDescription>
        </Alert>
      ) : null}

      {!hasNumbers ? (
        <Section variant="flat" className="space-y-4">
          <Text variant="muted">
            This workspace has no phone numbers that can receive calls, so
            there is nothing to attach a greeting to yet.
          </Text>
          <Button asChild>
            <Link to={`/workspaces/${workspaceId}/settings/numbers`}>
              Add a phone number
            </Link>
          </Button>
        </Section>
      ) : (
        <Form method="POST" encType="multipart/form-data" className="space-y-6">
          <Section variant="flat" className="space-y-4">
              <FormField label="Greeting">
                <div className="space-y-3">
                  {greetings.length > 0 ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="greeting-source"
                        value="existing"
                        checked={source === "existing"}
                        onChange={() => setSource("existing")}
                        className="h-4 w-4 accent-brand-primary"
                      />
                      <Text>Use audio already in this workspace</Text>
                    </label>
                  ) : null}

                  {source === "existing" && greetings.length > 0 ? (
                    <div className="space-y-2 pl-6">
                      {greetings.map((greeting) => (
                        <div key={greeting.id} className="space-y-1">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="existing-greeting"
                              value={greeting.name}
                              className="h-4 w-4 accent-brand-primary"
                            />
                            <Text variant="small">{greeting.name}</Text>
                          </label>
                          {greeting.signed_url ? (
                            <audio
                              controls
                              src={greeting.signed_url}
                              className="ml-6 h-8 w-full max-w-xs"
                            >
                              <track kind="captions" />
                            </audio>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="greeting-source"
                      value="upload"
                      checked={source === "upload"}
                      onChange={() => setSource("upload")}
                      className="h-4 w-4 accent-brand-primary"
                    />
                    <Text>Upload a new greeting</Text>
                  </label>

                  {source === "upload" ? (
                    <div className="space-y-4 pl-6">
                      <FormField htmlFor="media-name" label="Greeting name">
                        <Input
                          type="text"
                          name="media-name"
                          id="media-name"
                          placeholder="Main line greeting"
                        />
                      </FormField>
                      <FormField htmlFor="media" label="Audio file">
                        <Label
                          htmlFor="media"
                          className="flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-border py-8 text-center transition-colors duration-150 ease-in-out hover:bg-muted"
                        >
                          {pendingFileName === ""
                            ? "Choose an audio file"
                            : pendingFileName}
                          <input
                            type="file"
                            name="media"
                            id="media"
                            accept={getAudioUploadAcceptValue()}
                            className="hidden"
                            onChange={(event) =>
                              setPendingFileName(
                                event.target.value.split("\\").at(-1) ?? "",
                              )
                            }
                          />
                        </Label>
                      </FormField>
                    </div>
                  ) : null}
                </div>
              </FormField>
          </Section>

          <Section variant="flat" className="space-y-4">
              <FormField
                label="Play it on these numbers"
                description="Callers to the numbers you pick will hear this greeting, then be able to leave a message."
              >
                <div className="space-y-3">
                  {numbers.map((number) => (
                    <div key={number.id} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id={`number-${number.id}`}
                        name="numberIds"
                        value={String(number.id)}
                        defaultChecked={numbers.length === 1}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-primary accent-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                      <div className="grid gap-0.5">
                        <Label
                          htmlFor={`number-${number.id}`}
                          className="font-normal"
                        >
                          {number.friendly_name || number.phone_number}
                        </Label>
                        {number.inbound_audio ? (
                          <Text variant="caption">
                            Currently plays {number.inbound_audio}
                          </Text>
                        ) : (
                          <Text variant="caption">No greeting yet</Text>
                        )}
                        {number.currentRouting && number.routingWouldChange ? (
                          <Text variant="caption" className="text-warning">
                            {number.currentRouting} — voicemail will replace this
                          </Text>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </FormField>
          </Section>

          <Section variant="flat" className="space-y-4">
              <FormField
                htmlFor="notify-email"
                label="Who should get the voicemails?"
                description="Recordings are emailed to this workspace member. Voicemail can't be answered without a recipient, so this is required."
              >
                {members.length > 0 ? (
                  <select
                    id="notify-email"
                    name="notify-email"
                    defaultValue={members.length === 1 ? members[0]!.email : ""}
                    className="w-full rounded-md border border-input bg-background p-2"
                  >
                    <option value="">Select a workspace member</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.email}>
                        {member.name
                          ? `${member.name} — ${member.email}`
                          : member.email}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Text variant="muted">
                    No workspace member has an email address to send voicemails
                    to.
                  </Text>
                )}
              </FormField>
          </Section>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Button type="submit" disabled={state !== "idle"} className="w-full">
              Save voicemail setup
            </Button>
            <Button asChild variant="outline">
              <Link to=".." relative="path">
                Back
              </Link>
            </Button>
          </div>
        </Form>
      )}
    </PageShell>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
