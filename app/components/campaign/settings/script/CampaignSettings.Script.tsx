import { useCallback, useMemo } from "react";
import type { Script } from "@/lib/types";
import { documentToScript, scriptToDocument } from "@/lib/call-script-service";
import { ScriptEditorShell } from "./ScriptEditorShell";

type PageData = {
  campaignDetails: {
    script: Script;
    [key: string]: unknown;
  };
};

type ScriptPageProps = {
  pageData: PageData;
  onPageDataChange: (data: PageData) => void;
  mediaNames: string[];
  onUploadAudio?: (file: File) => Promise<string | null>;
  readOnly?: boolean;
};

export default function CampaignSettingsScript({
  pageData,
  onPageDataChange,
  mediaNames,
  onUploadAudio,
  readOnly = false,
}: ScriptPageProps) {
  const script = pageData.campaignDetails.script;
  const document = useMemo(() => scriptToDocument(script), [script]);

  const handleChange = useCallback(
    (nextDocument: ReturnType<typeof scriptToDocument>) => {
      onPageDataChange({
        ...pageData,
        campaignDetails: {
          ...pageData.campaignDetails,
          script: documentToScript(script, nextDocument),
        },
      });
    },
    [onPageDataChange, pageData, script],
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
