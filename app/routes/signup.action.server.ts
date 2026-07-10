import { getSession } from "@/lib/auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { isSignupOpen } from "@/lib/env.server";
import { registerBodySchema } from "@/lib/schemas/api/platform-auth";
import { registerUser } from "@/lib/platform-auth.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { data as routeData, redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";

type ActionData = {
  error?: string;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!isSignupOpen()) {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return jsonError("Registration is closed.", 403);
    }
    const { headers } = await getSession(request);
    return routeData<ActionData>(
      { error: "Registration is closed." },
      { headers, status: 403 },
    );
  }

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

  const { headers: sessionHeaders } = await getSession(request);
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const firstName = formData.get("firstName");
  const lastName = formData.get("lastName");

  if (typeof email !== "string" || typeof password !== "string") {
    return routeData<ActionData>(
      { error: "Email and password are required." },
      { headers: sessionHeaders, status: 400 },
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
      { headers: sessionHeaders, status: result.status },
    );
  }

  const headers = mergeBetterAuthSetCookieHeaders(result.headers, sessionHeaders);
  return redirect("/workspaces", { headers });
};
