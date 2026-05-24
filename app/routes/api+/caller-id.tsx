export { action } from "./caller-id.action.server";

interface WorkspaceData {
  key: string;
  token: string;
  twilio_data: {
    sid: string;
    authToken: string;
  };
}

interface RequestBody {
  phoneNumber: string;
  workspace_id: string;
  friendlyName: string;
}

