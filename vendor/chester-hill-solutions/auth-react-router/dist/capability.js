import { data, redirect } from "react-router";
import { CapabilityDeniedError, emailsMatch, normalizeEmail, requireActorCapability, } from "@chester-hill-solutions/auth";
import { mergeSetCookieHeaders } from "@chester-hill-solutions/auth/cookies";
/**
 * Factory for route handlers that need a workspace capability after auth.
 * Call with `{ request, workspaceId, userId }` once the session/API-key user is known.
 */
export function createRequireCapability(options) {
    return async function requireCapability(args) {
        const actor = await options.resolveActor(args);
        if (actor instanceof Response) {
            return actor;
        }
        try {
            requireActorCapability(actor, options.capabilityId);
            return actor;
        }
        catch (error) {
            if (error instanceof CapabilityDeniedError) {
                if (options.onDenied) {
                    return options.onDenied(error);
                }
                return Response.json({ error: error.message, capabilityId: error.capabilityId }, { status: 403 });
            }
            throw error;
        }
    };
}
/**
 * Ensures the authenticated user has a verified email matching the invite.
 * Redirects anonymous users to login with continue; returns 403 on mismatch.
 */
export function createInviteCompletionLoader(options) {
    return async function inviteCompletionLoader({ request, url, }) {
        const headers = new Headers();
        const { user, headers: sessionHeaders } = await options.getSessionUser(request);
        mergeSetCookieHeaders(headers, sessionHeaders);
        if (!user) {
            throw redirect(options.loginUrlWithContinue(request, { url }), {
                headers,
            });
        }
        if (!user.emailVerified) {
            return data({ error: "Email must be verified before accepting an invitation", user }, { status: 403, headers });
        }
        const inviteEmail = await options.getInviteEmail({ request, url });
        if (!inviteEmail || !emailsMatch(user.email, inviteEmail)) {
            return data({
                error: "Signed-in email does not match this invitation",
                user,
                inviteEmail: inviteEmail ? normalizeEmail(inviteEmail) : null,
            }, { status: 403, headers });
        }
        return data({
            user,
            inviteEmail: normalizeEmail(inviteEmail),
        }, { headers });
    };
}
