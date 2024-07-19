import CampaignSettingsScript from "./CampaignSettings.Script";
import { MessageSettings } from "./MessageSettings";

export const ScriptEditorContent = ({ pageData, onPageDataChange, scripts, mediaNames, workspace_id, selected_id }:{
    pageData:object;
    onPageDataChange: (any) => void;
    scripts: any[];
    mediaNames: Array<string>;
    workspace_id: string;
    selected_id: string;
}) => {
  
  switch (pageData.type || !pageData?.type) {
    case "live_call":
    case "standalone_script":
    case "robocall":
    case "simple_ivr":
    case "complex_ivr":
    case null:
      return (
        <CampaignSettingsScript
          pageData={pageData}
          onPageDataChange={onPageDataChange}
          scripts={scripts}
          mediaNames={mediaNames}
        />
      );
    case "message":
      return (
        <MessageSettings
          pageData={pageData}
          onPageDataChange={onPageDataChange}
          workspace_id={workspace_id}
          selected_id={selected_id}
        />
      );
    default:
      return <div>Unsupported campaign type</div>;
  }
};
