#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";

const route = "app/routes/workspaces_.$id_.campaigns.$campaign_id.call.tsx";
const git = execSync(`git show 'HEAD:${route}'`, { encoding: "utf8" });
const lines = git.split("\n");
const loaderIdx = lines.findIndex((l) => l.startsWith("export const loader"));
const uiStart = lines.findIndex((l) => l.startsWith("const CallScreen"));
if (loaderIdx < 0 || uiStart < 0) {
  console.error("markers not found", loaderIdx, uiStart);
  process.exit(1);
}

const clientImports = `import {
  useLoaderData,
  useOutletContext,
  useNavigation,
  useNavigate,
  useFetcher,
  useRevalidator,
} from "react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import type { FC } from "react";
import { toast } from "sonner";
import {
  handleCall,
  handleConference,
  handleContact,
  handleQueue,
} from "@/lib/callscreenActions";
import { playTone } from "@/lib/utils";
import { generateToken } from "./api.token";
import { QueueList } from "@/components/call/CallScreen.QueueList";
import { CallArea } from "@/components/call/CallScreen.CallArea";
import { CallQuestionnaire } from "@/components/call/CallScreen.Questionnaire";
import { Household } from "@/components/call/CallScreen.Household";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { CampaignHeader } from "@/components/call/CallScreen.Header";
import { PhoneKeypad } from "@/components/call/CallScreen.DTMFPhone";
import { CampaignDialogs } from "@/components/call/CallScreen.Dialogs";
import { useWorkspaceRealtime, useWorkspaceRealtimeSubscription } from "@/hooks/realtime/useWorkspaceRealtime";
import useDebouncedSave from "@/hooks/utils/useDebouncedSave";
import useCallRoom from "@/hooks/call/useCallRoom";
import { useTwilioDevice } from "@/hooks/call/useTwilioDevice";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";
import { useCallState } from "@/hooks/call/useCallState";
import { useCallStatusPolling } from "@/hooks/call/useCallStatusPolling";
import {
  normalizeProviderStatus,
  getStateMachineAction,
} from "@/lib/call-status";
import { MemberRole } from "@/lib/member-role";
import { loader } from "./workspaces_.$id_.campaigns.$campaign_id.call.server";
`;

const ui = lines.slice(uiStart).join("\n");
const client = `export { loader, action } from "./workspaces_.$id_.campaigns.$campaign_id.call.server";

${clientImports}

${ui}
`;

fs.writeFileSync(route, client);
console.log(`restored ${client.split("\n").length} lines`);
