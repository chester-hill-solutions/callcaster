import { useCallback, useMemo } from "react";
import type React from "react";
import {
  ScriptEditor,
  ScriptKitCallScriptUiProvider,
} from "@chester-hill-solutions/scriptkit-call-script-react";
import "@chester-hill-solutions/scriptkit-call-script-react/styles/call-script-tokens.css";
import type { Script } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { documentToScript, scriptToDocument } from "@/lib/call-script-service";

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
};

export default function CampaignSettingsScript({
  pageData,
  onPageDataChange,
  mediaNames,
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
    <ScriptKitCallScriptUiProvider
      components={{
        Button: ({ onClick, disabled, children, type = "button" }) => (
          <Button
            type={type}
            onClick={onClick}
            disabled={disabled}
            size="sm"
            variant="outline"
          >
            {children as React.ReactNode}
          </Button>
        ),
        // Wraps the control so the label is actually associated with it. The
        // UI-kit contract has no id to thread through for htmlFor, and an
        // unassociated <Label> leaves every field unlabelled for screen
        // readers (and unfindable by role/label in tests).
        Field: ({ label, children }) => (
          <Label className="grid gap-2 font-normal">
            <span className="font-medium">{label}</span>
            {children as React.ReactNode}
          </Label>
        ),
        Textarea: ({ value, onChange, placeholder, readOnly, rows = 3 }) => (
          <Textarea
            value={value}
            placeholder={placeholder}
            readOnly={readOnly}
            rows={rows}
            onChange={(event) => onChange(event.target.value)}
          />
        ),
        Input: ({ value, onChange, placeholder, readOnly }) => (
          <Input
            value={value}
            placeholder={placeholder}
            readOnly={readOnly}
            onChange={(event) => onChange(event.target.value)}
          />
        ),
        Select: ({ value, onChange, options, readOnly }) => (
          <Select value={value} disabled={readOnly} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      }}
    >
      <ScriptEditor
        document={document}
        onChange={handleChange}
        palette="callcaster"
        mediaNames={mediaNames}
      />
    </ScriptKitCallScriptUiProvider>
  );
}
