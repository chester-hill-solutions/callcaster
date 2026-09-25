import { useCallback, useMemo, useRef } from "react";
import type { Script } from "@/lib/types";
import { documentToScript, scriptToDocument } from "@/lib/call-script-service";
import { isAudioScriptType } from "@/lib/ivr-script-editor";
import { ScriptEditorShell } from "./ScriptEditorShell";

type CampaignSettingsScriptProps = {
  script: Script;
  onChange: (nextScript: Script) => void;
  /**
   * Edit as audio steps for a recipient. Defaults from the script's own type; a
   * campaign that plays any script to recipients passes `true` regardless.
   */
  audioFlow?: boolean;
  mediaNames: string[];
  audioPreviewUrl?: (fileName: string) => string;
  onUploadAudio?: (file: File) => Promise<string | null>;
  readOnly?: boolean;
};

export default function CampaignSettingsScript({
  script,
  onChange,
  audioFlow,
  mediaNames,
  audioPreviewUrl,
  onUploadAudio,
  readOnly = false,
}: CampaignSettingsScriptProps) {
  const latestDocument = useRef<ReturnType<typeof scriptToDocument> | null>(null);
  const lastEmittedSteps = useRef<Script["steps"] | null>(null);
  const document = useMemo(() => {
    // Option ids exist only in the editor document. Re-importing the script we
    // just emitted regenerates them and remounts focused option inputs.
    if (script.steps === lastEmittedSteps.current && latestDocument.current) {
      return latestDocument.current;
    }

    const nextDocument = scriptToDocument(script);
    latestDocument.current = nextDocument;
    return nextDocument;
  }, [script]);

  const handleChange = useCallback(
    (nextDocument: ReturnType<typeof scriptToDocument>) => {
      latestDocument.current = nextDocument;
      const nextScript = documentToScript(script, nextDocument);
      lastEmittedSteps.current = nextScript.steps;
      onChange(nextScript);
    },
    [onChange, script],
  );

  return (
    <ScriptEditorShell
      document={document}
      onChange={handleChange}
      audioFlow={audioFlow ?? isAudioScriptType(script.type)}
      mediaNames={mediaNames}
      audioPreviewUrl={audioPreviewUrl}
      onUploadAudio={onUploadAudio}
      readOnly={readOnly}
    />
  );
}
