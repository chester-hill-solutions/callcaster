import { createCookieSessionStorage } from "react-router";
// Fallback lightweight theme session resolver to avoid dependency on remix-themes

// You can default to 'development' if process.env.NODE_ENV is not set
const isProduction = process.env.NODE_ENV === "production";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "theme",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secrets: ["asdkjflqkwemr"],
    // No explicit domain: a Domain attribute that doesn't match the host makes
    // browsers silently drop the cookie (the previous placeholder value meant
    // theme preferences never persisted in production).
    ...(isProduction ? { secure: true } : {}),
  },
});

export const themeSessionResolver = {
  async getTheme(request: Request): Promise<string | null> {
    const session = await sessionStorage.getSession(request.headers.get("Cookie"));
    return (session.get("theme") as string) ?? null;
  },
  async setTheme(theme: string, headers: Headers): Promise<void> {
    const session = await sessionStorage.getSession(headers.get("Cookie"));
    session.set("theme", theme);
    const cookie = await sessionStorage.commitSession(session);
    headers.append("Set-Cookie", cookie);
  },
};
