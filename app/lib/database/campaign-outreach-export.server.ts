import { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { extractKeys, flattenRow } from "../utils";

export type OutreachExportData = {
  answered_at: string | null;
  campaign_id: number;
  contact_id: number;
  created_at: string;
  current_step: string | null;
  disposition: string | null;
  ended_at: string | null;
  id: number;
  result: Json;
  user_id: string | null;
  workspace: string;
  contact: Database["public"]["Tables"]["contact"]["Row"];
  calls: { duration: number }[];
};

type WorkspaceUserData = {
  id: string;
  username: string;
  role: string;
};

export async function fetchOutreachData(
  supabaseClient: SupabaseClient<Database>,
  campaignId: string | number,
): Promise<OutreachExportData[]> {
  const { data, error } = await supabaseClient
    .from("outreach_attempt")
    .select(`
      *,
      contact:contact_id(*),
      calls:call!outreach_attempt_id(duration)
    `)
    .eq("campaign_id", Number(campaignId));

  if (error) throw new Error("Error fetching data");
  return (data || []) as unknown as OutreachExportData[];
}

export function processOutreachExportData(
  data: OutreachExportData[],
  users: WorkspaceUserData[],
) {
  const { dynamicKeys, resultKeys, otherDataKeys } = extractKeys(data);
  let csvHeaders = [...dynamicKeys, ...otherDataKeys].map((header) =>
    header === "id"
      ? "attempt_id"
      : header === "contact_id"
        ? "callcaster_id"
        : header,
  );

  const flattenedData = data.map((row) => flattenRow(row, users));
  type FlattenedExportRow = (typeof flattenedData)[number];

  flattenedData.sort((a, b) => {
    const diff = Number(a.callcaster_id) - Number(b.callcaster_id);
    if (Number.isFinite(diff) && diff !== 0) return diff;
    return new Date(a.created_at ?? "").getTime() - new Date(b.created_at ?? "").getTime();
  });

  const mergedData: FlattenedExportRow[] = [];
  let currentGroup: FlattenedExportRow | null = null;

  flattenedData.forEach((row) => {
    if (
      !currentGroup ||
      row.callcaster_id !== currentGroup.callcaster_id ||
      new Date(row.created_at ?? "").getTime() -
        new Date(currentGroup.created_at ?? "").getTime() >
        12 * 60 * 60 * 1000
    ) {
      if (currentGroup) {
        mergedData.push(currentGroup);
      }
      currentGroup = { ...row };
    } else {
      Object.keys(row).forEach((key) => {
        // Keep `call_duration` max via special handling below.
        if (key === "call_duration") return;
        if (row[key] != null && row[key] !== "" && currentGroup) {
          currentGroup[key] = row[key];
        }
      });

      // Special handling for call_duration - keep the longer duration
      const next = Number(row.call_duration);
      const prev = Number(currentGroup.call_duration);
      if (Number.isFinite(next) && (!Number.isFinite(prev) || next > prev)) {
        currentGroup.call_duration = next;
      }
    }
  });

  if (currentGroup) {
    mergedData.push(currentGroup);
  }

  // Filter headers but ensure call_duration remains
  csvHeaders = csvHeaders.filter(
    (header) =>
      typeof header === "string" &&
      (header === "call_duration" ||
        mergedData.some(
          (row) => row[header] != null && row[header] !== "",
        )),
  );

  return { csvHeaders, flattenedData: mergedData };
}
