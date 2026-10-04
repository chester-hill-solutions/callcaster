import { createCookie } from "react-router";
import { z } from "zod";
import { env } from "@/lib/env.server";

const FLASH_TTL_MS = 5 * 60 * 1000;
const invitationFlashSchema = z.object({
  code: z.literal("invite_accepted"),
  id: z.string().uuid(),
  expiresAt: z.number().int(),
}).strict();

export type InvitationFlash = { code: "invite_accepted"; id: string };

function invitationCookie(request: Request) {
  return createCookie("cc.flash", {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/workspaces",
    maxAge: FLASH_TTL_MS / 1000,
    secrets: [env.BETTER_AUTH_SECRET()],
  });
}

export async function appendInvitationAcceptedFlash(request: Request, headers: Headers): Promise<Headers> {
  headers.append("Set-Cookie", await invitationCookie(request).serialize({
    code: "invite_accepted",
    id: crypto.randomUUID(),
    expiresAt: Date.now() + FLASH_TTL_MS,
  }));
  return headers;
}

/** Cookie clearing is best effort across concurrent tabs, not a durable receipt. */
export async function consumeInvitationFlash(request: Request): Promise<{
  flash: InvitationFlash | null;
  clearCookie: string;
}> {
  const cookie = invitationCookie(request);
  const clearCookie = await cookie.serialize("", { maxAge: 0 });
  let value: unknown;
  try {
    value = await cookie.parse(request.headers.get("Cookie"));
  } catch {
    return { flash: null, clearCookie };
  }
  const parsed = invitationFlashSchema.safeParse(value);
  const now = Date.now();
  if (!parsed.success || parsed.data.expiresAt <= now || parsed.data.expiresAt > now + FLASH_TTL_MS) {
    return { flash: null, clearCookie };
  }
  return { flash: { code: parsed.data.code, id: parsed.data.id }, clearCookie };
}
