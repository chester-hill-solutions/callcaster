import { useCallback, useMemo } from "react";
import type { Script } from "@/lib/types";
import { documentToScript, scriptToDocument } from "@/lib/call-script-service";
import { isAudioScriptType } from "@/lib/ivr-script-editor";
import { ScriptEditorShell } from "./ScriptEditorShell";

type CampaignSettingsScriptProps = {
  script: Script;
  onChange: (nextScript: Script) => void;
  /**
   * Edit as audio steps for a caller. Defaults from the script's own type; a
   * campaign that plays any script to callers passes `true` regardless.
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
  const document = useMemo(() => scriptToDocument(script), [script]);

  const handleChange = useCallback(
    (nextDocument: ReturnType<typeof scriptToDocument>) => {
      onChange(documentToScript(script, nextDocument));
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
