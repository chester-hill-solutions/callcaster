import { csvResponse, toCsvString, type CsvCell } from "@/lib/csv";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { parseActionRequest, requireWorkspaceAccess } from "@/lib/database.server";
import {
  listAudienceContactsForExport,
  listAudienceContactsJson,
} from "@/lib/database/contact-audience.server";
import { resolveDualAuthSession } from "@/lib/api-auth.server";
import { findAudienceWorkspaceById } from "@/lib/audience-upload-db.server";

interface AuthSessionResponse {
    headers: Headers;
}

interface OtherDataItem {
    key: string;
    value: string | number | boolean;
}

type AudiencesDeps = {
  verifyAuth: (request: Request) => Promise<{ user: { id: string }; headers: Headers }>;
  parseActionRequest: (request: Request) => Promise<Record<string, unknown>>;
  requireWorkspaceAccess: (args: unknown) => Promise<void>;
};

const AUDIENCE_CONTACT_SORT_KEYS = new Set([
  "id",
  "firstname",
  "surname",
  "phone",
  "email",
  "address",
  "city",
  "province",
  "postal",
  "country",
  "created_at",
]);

function flattenAudienceExportRows(rawData: Array<Record<string, unknown>>) {
  return rawData.map((row) => {
    const flatRow: Record<string, unknown> = { ...row };
    if (row.other_data && Array.isArray(row.other_data) && row.other_data.length > 0) {
      const otherData = row.other_data as unknown as OtherDataItem[];
      otherData.forEach((item) => {
        if (item && typeof item === "object" && "key" in item && "value" in item) {
          flatRow[item.key] = item.value;
        }
      });
    }
    delete flatRow.other_data;
    delete flatRow.contact;
    return flatRow;
  });
}

export const loader = async ({ request, deps }: { request: Request; deps?: Partial<AudiencesDeps> }) => {

    const d = {
      verifyAuth: deps?.verifyAuth ?? resolveDualAuthSession,
      parseActionRequest: deps?.parseActionRequest ?? parseActionRequest,
      requireWorkspaceAccess: deps?.requireWorkspaceAccess ?? requireWorkspaceAccess,
    };
    const { headers, user } = await d.verifyAuth(request);
    const url = new URL(request.url);
    const audienceId = url.searchParams.get('audienceId');
    const returnType = url.searchParams.get('returnType');
    const sortKey = url.searchParams.get("sortKey") || "id";
    const sortDirectionRaw = url.searchParams.get("sortDirection") || "asc";
    const sortDirection = sortDirectionRaw === "desc" ? "desc" : "asc";
    const q = (url.searchParams.get("q") || "").trim();

    if (returnType === 'csv') {
        if (!audienceId) {
          return routeData({ error: "Missing audienceId" }, { status: 400, headers });
        }

        const id = parseInt(audienceId, 10);
        if (Number.isNaN(id)) {
          return routeData({ error: "Invalid audienceId" }, { status: 400, headers });
        }

        // Defense-in-depth: verify the audience belongs to a workspace the user can access.
        const audienceWorkspace = await findAudienceWorkspaceById(id);
        if (!audienceWorkspace) {
          return routeData({ error: "Audience not found" }, { status: 404, headers });
        }
        if (user) {
          await d.requireWorkspaceAccess({
            user,
            workspaceId: audienceWorkspace,
          });
        }

        const rawData = await listAudienceContactsForExport(audienceWorkspace, id, {
          q: q || undefined,
          sortKey: AUDIENCE_CONTACT_SORT_KEYS.has(sortKey) ? sortKey : undefined,
          sortDirection,
        });

        const processedData = flattenAudienceExportRows(rawData);

        // Deterministic headers: stable ordering across runs.
        const firstProcessedRow =
          processedData && processedData.length > 0 ? processedData[0] : undefined;
        const rowHeaders = firstProcessedRow ? Object.keys(firstProcessedRow).sort() : [];

        const csvString = toCsvString({
          headers: rowHeaders,
          rows: (processedData ?? []) as Array<Record<string, CsvCell>>,
        });
        
        const filename = `audience_${audienceId}.csv`;
        
        return csvResponse({
          filename,
          csv: csvString,
          headers: Object.fromEntries(headers.entries()),
        });
    }
    // Handle regular JSON response
    let parsedAudienceId: number | undefined;
    if (audienceId) {
        const id = parseInt(audienceId, 10);
        if (!isNaN(id)) {
            parsedAudienceId = id;
        }
    }

    try {
      const data = await listAudienceContactsJson(parsedAudienceId);
      return routeData({ data }, { headers });
    } catch (error) {
      logger.error("Error fetching contact audience data:", error);
      throw error;
    }
}
