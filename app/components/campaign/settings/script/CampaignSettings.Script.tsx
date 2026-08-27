import { useCallback, useMemo } from "react";
import type { Script } from "@/lib/types";
import { documentToScript, scriptToDocument } from "@/lib/call-script-service";
import { ScriptEditorShell } from "./ScriptEditorShell";

type CampaignSettingsScriptProps = {
  script: Script;
  onChange: (nextScript: Script) => void;
  mediaNames: string[];
  onUploadAudio?: (file: File) => Promise<string | null>;
  readOnly?: boolean;
};

export default function CampaignSettingsScript({
  script,
  onChange,
  mediaNames,
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
      mediaNames={mediaNames}
      onUploadAudio={onUploadAudio}
      readOnly={readOnly}
    />
  );
}
