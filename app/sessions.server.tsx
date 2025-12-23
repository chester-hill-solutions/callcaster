import { createCookieSessionStorage } from "@remix-run/node";
<<<<<<< HEAD
// import { createThemeSessionResolver } from "remix-themes";
=======
// Fallback lightweight theme session resolver to avoid dependency on remix-themes
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)

// You can default to 'development' if process.env.NODE_ENV is not set
const isProduction = process.env.NODE_ENV === "production";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "theme",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secrets: ["asdkjflqkwemr"],
    // Set domain and secure only if in production
    ...(isProduction
      ? { domain: "your-production-domain.com", secure: true }
      : {}),
  },
});

<<<<<<< HEAD
// export const themeSessionResolver = createThemeSessionResolver(sessionStorage);
export const themeSessionResolver = sessionStorage; // Temporary workaround until remix-themes is compatible
=======
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
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)
