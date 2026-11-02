import { errorResponse, rateLimitResponse } from "@/lib/openapi-platform-components";
import { sessionCookieSecurity } from "@/lib/openapi-integrator";

/** Session-only funding contract for browser handset calls. */
export const handsetPathOverrides: Record<string, Record<string, unknown>> = {
  "/api/workspaces/{workspaceId}/handset/session": {
    post: {
      operationId: "prepareHandsetDial",
      "x-callcaster-supported": true,
      "x-callcaster-exposure": "sessionOnly",
      "x-callcaster-auth-class": "session",
      "x-callcaster-docs-guide": "docs/api-live-operations.md",
      summary: "Prepare a funded handset dial",
      description: "Session authentication only. Reserve four credits for one staffed call before Device.connect. The client identity must belong to the user's active handset session. Send the returned reservation_id as credit_reservation in the SDK parameters. Repeated preparation for the same unsent intent returns the same hold. An accepted or uncertain root returns 409; a new dial action uses a new UUID. Token creation and inbound availability remain credit-free.",
      tags: ["Telephony"],
      security: [...sessionCookieSecurity],
      parameters: [{ name: "workspaceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/HandsetDialPreparationRequest" } } } },
      responses: {
        "200": { description: "One funded dial intent", content: { "application/json": { schema: { $ref: "#/components/schemas/HandsetDialPreparationResponse" } } } },
        "400": errorResponse("Invalid handset dial or unavailable caller ID"),
        "401": errorResponse("Authentication required"),
        "403": errorResponse("The current session cannot dial"),
        "402": { description: "Available credits cannot fund the call", content: { "application/json": { schema: { type: "object", required: ["error", "creditsError"], properties: { error: { type: "string", enum: ["Insufficient credits"] }, creditsError: { type: "boolean", enum: [true] } } } } } },
        "404": errorResponse("Workspace or owned handset session not found"),
        "409": errorResponse("The intent already started or needs recovery"),
        "429": rateLimitResponse,
        "500": errorResponse("Unable to prepare the handset call"),
      },
    },
  },
};
