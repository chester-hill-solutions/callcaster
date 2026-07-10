#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = [
  "app/routes/api+/workspaces+/$workspaceId/contacts.loader.server.ts",
  "app/routes/api+/workspaces+/$workspaceId/campaigns.loader.server.ts",
  "app/routes/api+/workspaces+/$workspaceId/conversations.loader.server.ts",
  "app/routes/api+/workspaces+/$workspaceId/conversations/$contactNumber.loader.server.ts",
  "app/routes/api+/workspaces+/$workspaceId/conversations/$contactNumber.action.server.ts",
  "app/routes/api+/workspaces+/$workspaceId/scripts.loader.server.ts",
  "app/routes/api+/workspaces+/$workspaceId/surveys.loader.server.ts",
  "app/routes/api+/workspaces+/$workspaceId/audiences/$audienceId.loader.server.ts",
  "app/routes/api+/workspaces+/$workspaceId/audiences/$audienceId/uploads.loader.server.ts",
  "app/routes/api+/workspaces+/$workspaceId/audience-uploads/$uploadId.loader.server.ts",
];

for (const rel of files) {
  const file = path.join(root, rel);
  let src = fs.readFileSync(file, "utf8");

  if (!src.includes("resolveDataPlaneAuth")) continue;

  if (!src.includes("getDataPlaneRouteContext")) {
    src = src.replace(
      /from "@\/lib\/platform-data\.server";/,
      'from "@/lib/platform-data.server";\nimport { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";',
    );
    src = src.replace(
      /,\n  resolveDataPlaneAuth,\n/,
      ",\n",
    );
    src = src.replace(
      /resolveDataPlaneAuth,\n/,
      "",
    );
  }

  src = src.replace(
    /(\{ request, params)(\}:\s*(?:Loader|Action)FunctionArgs)/,
    "$1, context$2",
  );

  src = src.replace(
    /\n\s*const auth = await resolveDataPlaneAuth\(request, workspaceId\);\n\s*if \(auth instanceof Response\) return auth;\n/g,
    "\n  getDataPlaneRouteContext(context, workspaceId);\n",
  );

  fs.writeFileSync(file, src);
  console.log("updated", rel);
}
