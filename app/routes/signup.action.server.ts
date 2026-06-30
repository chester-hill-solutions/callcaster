import { getSession } from "@/lib/auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { registerBodySchema } from "@/lib/schemas/api/platform-auth";
import { registerUser } from "@/lib/platform-auth.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { data as routeData, redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { headers } = await getSession(request);
  const { data: serverSession } = await request.getSession();

  if (serverSession?.session) {
    return redirect("/workspaces", { headers });
  }
  return routeData({ serverSession }, { headers });
};

type ActionData = {
  error?: string;
  success?: boolean;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const parsed = await parseJsonBodyOrResponse(request, registerBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await registerUser(request, parsed);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return jsonResponse(result.data, 201);
  }

  const { headers } = await getSession(request);
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const firstName = formData.get("firstName");
  const lastName = formData.get("lastName");

  if (
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return routeData<ActionData>(
      { error: "Email and password are required." },
      { headers, status: 400 },
    );
  }

  const result = await registerUser(request, {
    email,
    password,
    first_name: typeof firstName === "string" ? firstName : undefined,
    last_name: typeof lastName === "string" ? lastName : undefined,
  });

  if (!result.ok) {
    return routeData<ActionData>(
      { error: result.error },
      { headers, status: result.status },
    );
  }

  return routeData<ActionData>({ success: true }, { headers });
};
