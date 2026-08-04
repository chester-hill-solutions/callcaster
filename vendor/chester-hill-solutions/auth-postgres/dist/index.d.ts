import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import type { AuthUser, SessionReader } from "@chester-hill-solutions/auth";
import { mergeSetCookieHeaders } from "@chester-hill-solutions/auth/cookies";
export type AuthConfig = BetterAuthOptions;
type ParsedSessionUser = {
    id: string;
    email?: string;
    name?: string | null;
    emailVerified?: boolean | null;
};
type GetSessionWithHeadersResult = {
    headers: Headers;
    response: {
        user?: ParsedSessionUser;
    } | null;
};
/** Minimal surface required for session reads (accepts any configured auth instance). */
export type AuthSessionSource = {
    api: {
        getSession: (input: {
            headers: Headers;
            returnHeaders: true;
        }) => Promise<GetSessionWithHeadersResult | unknown>;
    };
};
/** Full configured auth instance (for app-level `auth.api.*` typing). */
export type AuthInstance = ReturnType<typeof betterAuth>;
export declare function auth<const O extends BetterAuthOptions>(config: O): import("better-auth").Auth<O>;
/** Provider-specific Set-Cookie merge using Better Auth cookie parsing. */
export declare function mergeAuthSetCookieHeaders(targetHeaders: Headers, sourceHeaders: Headers): void;
/** @deprecated Use mergeAuthSetCookieHeaders */
export declare const mergeBetterAuthSetCookieHeaders: typeof mergeAuthSetCookieHeaders;
export declare function userFromSignInResponse(res: unknown): AuthUser | null;
export declare function createSessionReader(instance: AuthSessionSource): SessionReader;
export { mergeSetCookieHeaders };
export * from "./workspace-access.js";
export * from "./workspace-feature-access.js";
export * from "./invitation.js";
export * from "./product-role-seeds.js";
export { WORKSPACE_FEATURE_AUTHZ_DDL, WORKSPACE_MEMBER_ROLE_ID_MIGRATION_DDL, } from "./workspace-feature-sql.js";
export { WORKSPACE_INVITATION_DDL } from "./invitation-sql.js";
export { workspaceInvitations, type WorkspaceInvitationInsert, type WorkspaceInvitationRow, } from "./invitation-schema.js";
