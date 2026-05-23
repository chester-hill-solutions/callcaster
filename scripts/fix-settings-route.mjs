#!/usr/bin/env node
import fs from "node:fs";

const tsxPath = "app/routes/workspaces_.$id.campaigns.$selected_id.settings.tsx";
const serverPath = "app/routes/workspaces_.$id.campaigns.$selected_id.settings.server.tsx";

const tsx = fs.readFileSync(tsxPath, "utf8");
const server = fs.readFileSync(serverPath, "utf8");
const defaultIdx = tsx.indexOf("export default function");

const clientOnlyStart = tsx.indexOf("type CampaignStatus");
const beforeDefault = tsx.slice(clientOnlyStart, defaultIdx);

const serverImports = `import { defer, json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import {
  fetchCampaignAudience,
  fetchQueueCounts,
  getWorkspacePhoneNumbers,
  getWorkspaceTwilioPortalConfigFromTwilioData,
  getWorkspaceTwilioSyncSnapshotFromTwilioData,
  getSignedUrls,
  getCampaignTableKey,
  parseActionRequest,
  updateCampaign,
} from "@/lib/database.server";
import { getWorkspaceMessagingOnboardingFromTwilioData } from "@/lib/messaging-onboarding.server";
import { workspaceMessagingServiceHasAvailableSenders } from "@/lib/sms-campaign-send-mode";
import { verifyAuth } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import type {
  Campaign,
  CampaignStatus,
  TwilioAccountData,
  QueueItem,
  LiveCampaign,
  MessageCampaign,
  IVRCampaign,
  Script,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type CampaignDetails = (LiveCampaign | MessageCampaign | IVRCampaign) & {
  script?: Script;
  mediaLinks?: string[];
};

`;

const serverHelpers = beforeDefault.slice(
  beforeDefault.indexOf("function normalizeSchedule"),
  beforeDefault.indexOf("export default"),
);

fs.writeFileSync(serverPath, `${serverImports}${serverHelpers}\n${server}`);

const pureClientHelpers = beforeDefault.slice(
  0,
  beforeDefault.indexOf("async function updateCampaignStatus"),
);

const client = `export { loader, action } from "./workspaces_.$id.campaigns.$selected_id.settings.server";

import { useFetcher, useLoaderData, useNavigate, useOutletContext } from "react-router";
import { CampaignSettings } from "@/components/campaign/settings/CampaignSettings";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Audience,
  Campaign,
  Script,
  WorkspaceNumbers,
  Schedule,
  WorkspaceData,
  QueueItem,
  LiveCampaign,
  MessageCampaign,
  IVRCampaign,
  Survey,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { deepEqual } from "@/lib/utils";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loader, action } from "./workspaces_.$id.campaigns.$selected_id.settings.server";

${pureClientHelpers}
${tsx.slice(defaultIdx)}
`;

fs.writeFileSync(tsxPath, client);
console.log("fixed settings route");
