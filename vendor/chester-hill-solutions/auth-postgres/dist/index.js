import { betterAuth } from "better-auth";
import { splitSetCookieHeader } from "better-auth/cookies";
import { mergeSetCookieHeaders } from "@chester-hill-solutions/auth/cookies";
function parseGetSessionResult(result) {
    if (!result || typeof result !== "object") {
        return { headers: new Headers(), response: null };
    }
    const record = result;
    const headers = record.headers instanceof Headers ? record.headers : new Headers();
    const response = record.response;
    if (response === null || response === undefined) {
        return { headers, response: null };
    }
    if (typeof response !== "object") {
        return { headers, response: null };
    }
    const user = response.user;
    if (!user || typeof user !== "object") {
        return { headers, response: null };
    }
    const u = user;
    if (!u.id) {
        return { headers, response: null };
    }
    return {
        headers,
        response: {
            user: {
                id: u.id,
                email: u.email,
                name: u.name ?? null,
                emailVerified: u.emailVerified ?? null,
            },
        },
    };
}
export function auth(config) {
    return betterAuth(config);
}
function readAuthSetCookiesFromHeaders(sourceHeaders) {
    const getSetCookie = sourceHeaders.getSetCookie?.bind(sourceHeaders);
    if (getSetCookie)
        return getSetCookie();
    return splitSetCookieHeader(sourceHeaders.get("set-cookie") ?? "");
}
/** Provider-specific Set-Cookie merge using Better Auth cookie parsing. */
export function mergeAuthSetCookieHeaders(targetHeaders, sourceHeaders) {
    for (const setCookie of readAuthSetCookiesFromHeaders(sourceHeaders)) {
        targetHeaders.append("Set-Cookie", setCookie);
    }
}
/** @deprecated Use mergeAuthSetCookieHeaders */
export const mergeBetterAuthSetCookieHeaders = mergeAuthSetCookieHeaders;
function toAuthUser(user) {
    if (!user?.id || !user.email)
        return null;
    return {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        emailVerified: user.emailVerified ?? null,
    };
}
export function userFromSignInResponse(res) {
    if (!res || typeof res !== "object" || !("response" in res))
        return null;
    const response = res.response;
    return toAuthUser(response?.user);
}
export function createSessionReader(instance) {
    return {
        async getSessionUserId(request) {
            const headers = new Headers();
            const sessionResult = parseGetSessionResult(await instance.api.getSession({
                headers: request.headers,
                returnHeaders: true,
            }));
            mergeAuthSetCookieHeaders(headers, sessionResult.headers);
            return {
                userId: sessionResult.response?.user?.id ?? null,
                headers,
            };
        },
        async getSessionUser(request) {
            const headers = new Headers();
            const sessionResult = parseGetSessionResult(await instance.api.getSession({
                headers: request.headers,
                returnHeaders: true,
            }));
            mergeAuthSetCookieHeaders(headers, sessionResult.headers);
            return {
                user: toAuthUser(sessionResult.response?.user?.email
                    ? sessionResult.response.user
                    : undefined),
                headers,
            };
        },
    };
}
export { mergeSetCookieHeaders };
export * from "./workspace-access.js";
export * from "./workspace-feature-access.js";
export * from "./invitation.js";
export * from "./product-role-seeds.js";
export { WORKSPACE_FEATURE_AUTHZ_DDL, WORKSPACE_MEMBER_ROLE_ID_MIGRATION_DDL, } from "./workspace-feature-sql.js";
export { WORKSPACE_INVITATION_DDL } from "./invitation-sql.js";
export { workspaceInvitations, } from "./invitation-schema.js";
