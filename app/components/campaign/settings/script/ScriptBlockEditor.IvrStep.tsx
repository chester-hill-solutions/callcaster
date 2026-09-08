import { useId, useRef, useState, type ChangeEvent } from "react";
import type { ScriptBlock } from "@chester-hill-solutions/scriptkit-call-script-core";
import { Mic, Volume2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";
import {
  ensurePlaybackTypePatch,
  getBlockVoice,
  getIvrPlaybackMode,
  playbackModePatch,
  voicePatch,
} from "@/lib/ivr-script-editor";
import { DEFAULT_VOICE_ID, TTS_VOICES } from "@/lib/tts-voices";

export type IvrStepFieldsProps = {
  block: ScriptBlock;
  readOnly: boolean;
  mediaNames: string[];
  audioPreviewUrl?: (fileName: string) => string;
  onUploadAudio?: (file: File) => Promise<string | null>;
  onChange: (patch: Partial<ScriptBlock>) => void;
};

/**
 * The audio half of an IVR step: what plays to the caller, and how.
 *
 * Two modes map onto the runtime's two verbs — a spoken step becomes
 * `<Say>` of the step's text in the chosen voice, a recording step becomes
 * `<Play>` of a library file. Both live in `audioFile` on the wire, so the
 * mode is what tells the runtime how to read that field.
 */
export function IvrStepFields({
  block,
  readOnly,
  mediaNames,
  audioPreviewUrl,
  onUploadAudio,
  onChange,
}: IvrStepFieldsProps) {
  const mode = getIvrPlaybackMode(block);
  const audioFile = block.audioFile ?? "";
  const prompt = "prompt" in block ? (block.prompt ?? "") : "";
  const textId = useId();
  const voiceId = useId();
  const fileId = useId();
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

  const handleAudioFileSelected = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUploadAudio) return;
    setIsUploadingAudio(true);
    try {
      const name = await onUploadAudio(file);
      if (!name) return;
      // An upload from a spoken step must also switch the step to a
      // recording, or playback keeps speaking the old text (#1325).
      const patch: Partial<ScriptBlock> =
        block.callcasterType === "recorded"
          ? ({ audioFile: name } as Partial<ScriptBlock>)
          : ({ audioFile: name, ...playbackModePatch(block, "recorded") } as Partial<ScriptBlock>);
      onChange(patch);
    } finally {
      setIsUploadingAudio(false);
    }
  };

  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">What the caller hears</span>
        <div role="group" aria-label="Playback mode" className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "synthetic" ? "default" : "outline"}
            aria-pressed={mode === "synthetic"}
            disabled={readOnly}
            onClick={() => onChange(playbackModePatch(block, "synthetic"))}
          >
            <Volume2 className="mr-1 h-3.5 w-3.5" aria-hidden />
            Speak text
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "recorded" ? "default" : "outline"}
            aria-pressed={mode === "recorded"}
            disabled={readOnly}
            onClick={() => onChange(playbackModePatch(block, "recorded"))}
          >
            <Mic className="mr-1 h-3.5 w-3.5" aria-hidden />
            Play a recording
          </Button>
        </div>
      </div>

      {mode === "synthetic" ? (
        <SpokenStepFields
          block={block}
          text={audioFile}
          prompt={prompt}
          readOnly={readOnly}
          textId={textId}
          voiceId={voiceId}
          onChange={onChange}
        />
      ) : (
        <RecordingStepFields
          block={block}
          fileName={audioFile}
          mediaNames={mediaNames}
          readOnly={readOnly}
          fileId={fileId}
          audioPreviewUrl={audioPreviewUrl}
          onChange={onChange}
        />
      )}

      {!readOnly && onUploadAudio && (
        <div className="grid gap-1">
          <input
            ref={audioInputRef}
            type="file"
            accept={getAudioUploadAcceptValue()}
            className="hidden"
            onChange={handleAudioFileSelected}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="justify-self-start"
            disabled={isUploadingAudio}
            onClick={() => audioInputRef.current?.click()}
          >
            {isUploadingAudio ? "Uploading…" : "Upload audio"}
          </Button>
          {mode !== "recorded" && (
            <p className="text-xs text-muted-foreground">
              Uploading switches this step to a recording.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SpokenStepFields({
  block,
  text,
  prompt,
  readOnly,
  textId,
  voiceId,
  onChange,
}: {
  block: ScriptBlock;
  text: string;
  prompt: string;
  readOnly: boolean;
  textId: string;
  voiceId: string;
  onChange: (patch: Partial<ScriptBlock>) => void;
}) {
  const voice = getBlockVoice(block) ?? DEFAULT_VOICE_ID;
  const isSilent = text.trim().length === 0;
  const canUsePrompt = isSilent && prompt.trim().length > 0 && !readOnly;

  return (
    <>
      <FormField
        label="Speech text"
        htmlFor={textId}
        description="Read aloud to the caller in the selected voice."
      >
        <Textarea
          id={textId}
          value={text}
          readOnly={readOnly}
          onChange={(event) =>
            onChange({
              audioFile: event.target.value,
              ...ensurePlaybackTypePatch(block),
            } as Partial<ScriptBlock>)
          }
        />
      </FormField>
      {canUsePrompt && (
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">
            This step's prompt text is not spoken: “{prompt}”
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="justify-self-start"
            onClick={() =>
              onChange({
                audioFile: prompt,
                ...ensurePlaybackTypePatch(block),
              } as Partial<ScriptBlock>)
            }
          >
            Speak the prompt text
          </Button>
        </div>
      )}
      <FormField
        label="Voice"
        htmlFor={voiceId}
        description="Place a test call from the launch page to hear this step."
      >
        <Select
          value={voice}
          disabled={readOnly}
          onValueChange={(value) => onChange(voicePatch(block, value))}
        >
          <SelectTrigger id={voiceId}>
            <SelectValue placeholder="Select a voice…" />
          </SelectTrigger>
          <SelectContent>
            {TTS_VOICES.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {isSilent && (
        <Alert variant="warning">
          <AlertDescription>
            Callers hear nothing at this step yet. Enter the text to speak, or
            switch to a recording.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

function RecordingStepFields({
  block,
  fileName,
  mediaNames,
  readOnly,
  fileId,
  audioPreviewUrl,
  onChange,
}: {
  block: ScriptBlock;
  fileName: string;
  mediaNames: string[];
  readOnly: boolean;
  fileId: string;
  audioPreviewUrl?: (fileName: string) => string;
  onChange: (patch: Partial<ScriptBlock>) => void;
}) {
  const inLibrary = fileName.length === 0 || mediaNames.includes(fileName);
  // A step can point at a file that is no longer in the library (deleted, or
  // typed by hand in an older editor). Keep it visible rather than blanking
  // the control, so the author can see what the step will try to play.
  const choices = inLibrary ? mediaNames : [fileName, ...mediaNames];
  const hasChoices = choices.length > 0;

  return (
    <>
      <FormField
        label="Recording"
        htmlFor={fileId}
        description={
          hasChoices
            ? "From the workspace audio library."
            : "No recordings in the library yet. Upload one below."
        }
      >
        {hasChoices ? (
          <Select
            value={fileName}
            disabled={readOnly}
            onValueChange={(value) =>
              onChange({
                audioFile: value,
                ...ensurePlaybackTypePatch(block),
              } as Partial<ScriptBlock>)
            }
          >
            <SelectTrigger id={fileId}>
              <SelectValue placeholder="Select a recording…" />
            </SelectTrigger>
            <SelectContent>
              {choices.map((name) => (
                <SelectItem key={name} value={name}>
                  {name === fileName && !inLibrary
                    ? `${name} (not in library)`
                    : name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </FormField>
      {fileName.length > 0 && audioPreviewUrl && (
        <audio
          controls
          preload="none"
          src={audioPreviewUrl(fileName)}
          aria-label={`Preview ${fileName}`}
          className="h-8 w-full max-w-md"
        >
          <track kind="captions" />
        </audio>
      )}
      {fileName.length === 0 && (
        <Alert variant="warning">
          <AlertDescription>
            Choose or upload a recording, or callers hear nothing at this step.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
