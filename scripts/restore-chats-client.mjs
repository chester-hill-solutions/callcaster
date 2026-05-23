#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";

const route = "app/routes/workspaces_.$id.chats.tsx";
const git = execSync(`git show 'HEAD:${route}'`, { encoding: "utf8" });
const lines = git.split("\n");
const loaderIdx = lines.findIndex((l) => l.startsWith("export async function loader"));
const uiStart = lines.findIndex((l) => l.startsWith("export default function ChatsList"));
if (loaderIdx < 0 || uiStart < 0) {
  console.error("markers not found");
  process.exit(1);
}

const clientImports = `import {
  NavLink,
  Outlet,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useOutlet,
  useOutletContext,
  useParams,
  useSearchParams,
  useRouteError,
} from "react-router";
import { MdAdd, MdChat } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { isOptOutMessage, parseOptOutKeywords } from "@/lib/chat-opt-out";
import { formatMessageTimestamp, normalizePhoneNumber } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader as MobileSheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { phoneNumbersMatch } from "@/hooks/realtime/useChatRealtime";
import { useInfiniteScroll } from "@/hooks";
import ChatHeader from "@/components/sms-ui/ChatHeader";
import ChatInput from "@/components/sms-ui/ChatInput";
import ChatAddContactDialog from "@/components/sms-ui/ChatAddContactDialog";
import { useContactSearch } from "@/hooks/contact/useContactSearch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type {
  Contact,
  WorkspaceNumber,
} from "@/lib/types";
import { logger } from "@/lib/logger.client";
import { sendMessage } from "./api.chat_sms";
import { useSupabaseRealtimeSubscription } from "@/hooks/realtime/useSupabaseRealtime";
import {
  getConversationParticipantPhones,
  getChatSortOption,
  isInboundMessageDirection,
  normalizeConversationPhone,
  sortConversationSummaries,
  type ConversationSummary,
} from "@/lib/chat-conversation-sort";
import { loader } from "./workspaces_.$id.chats.server";
`;

const helpersAndTypes = lines.slice(80, loaderIdx).join("\n");
const ui = lines.slice(uiStart).join("\n");

const client = `export { loader } from "./workspaces_.$id.chats.server";

${clientImports}

${helpersAndTypes}

${ui}
`;

fs.writeFileSync(route, client);
console.log(`restored ${client.split("\n").length} lines`);
