export type AuthUser = {
    id: string;
    email: string;
    name?: string | null;
    emailVerified?: boolean | null;
};
export type SessionResult = {
    userId: string | null;
    headers: Headers;
};
export type SessionUserResult = {
    user: AuthUser | null;
    headers: Headers;
};
export type SessionReader = {
    getSessionUserId: (request: Request) => Promise<SessionResult>;
    getSessionUser: (request: Request) => Promise<SessionUserResult>;
};
export type RedirectOptions = {
    loginPath?: string;
    redirectParam?: string;
    /** React Router normalized location (use when `request.url` may include a `.data` suffix). */
    url?: URL;
};
export type BlockedPathOptions = {
    blockedPaths?: readonly string[];
};
export type PostgresActorOptions = {
    setting: string;
    value: string;
};
