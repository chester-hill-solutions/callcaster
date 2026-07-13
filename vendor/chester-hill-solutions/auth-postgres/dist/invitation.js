import { and, eq, gt } from "drizzle-orm";
import { generateOpaqueToken, hashOpaqueToken, InviteError, normalizeEmail, verifyOpaqueToken, } from "@chester-hill-solutions/auth";
import { workspaceMembers } from "./schema.js";
import { workspaceInvitations } from "./invitation-schema.js";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function newId(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
}
async function supersedePendingInvite(db, workspaceId, email) {
    await db
        .update(workspaceInvitations)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(and(eq(workspaceInvitations.workspaceId, workspaceId), eq(workspaceInvitations.email, email), eq(workspaceInvitations.status, "pending")));
}
export async function createInvitation(db, input) {
    const email = normalizeEmail(input.email);
    if (!email.includes("@")) {
        throw new InviteError("Invalid invite email", "INVITE_INVALID_EMAIL");
    }
    await supersedePendingInvite(db, input.workspaceId, email);
    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = input.expiresAt ?? new Date(Date.now() + DEFAULT_TTL_MS);
    const now = new Date();
    const [invitation] = await db
        .insert(workspaceInvitations)
        .values({
        id: input.id,
        workspaceId: input.workspaceId,
        email,
        roleId: input.roleId,
        invitedByUserId: input.invitedByUserId,
        tokenHash,
        status: "pending",
        expiresAt,
        createdAt: now,
        updatedAt: now,
    })
        .returning();
    if (!invitation) {
        throw new InviteError("Failed to create invitation", "INVITE_CREATE_FAILED", 500);
    }
    return { invitation, rawToken };
}
export async function resendInvitation(db, invitationId, options) {
    const [existing] = await db
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, invitationId))
        .limit(1);
    if (!existing) {
        throw new InviteError("Invitation not found", "INVITE_NOT_FOUND", 404);
    }
    if (existing.status !== "pending") {
        throw new InviteError("Only pending invitations can be resent", "INVITE_NOT_PENDING");
    }
    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = options?.expiresAt ?? new Date(Date.now() + DEFAULT_TTL_MS);
    const now = new Date();
    const [invitation] = await db
        .update(workspaceInvitations)
        .set({ tokenHash, expiresAt, updatedAt: now })
        .where(and(eq(workspaceInvitations.id, invitationId), eq(workspaceInvitations.status, "pending")))
        .returning();
    if (!invitation) {
        throw new InviteError("Invitation not found", "INVITE_NOT_FOUND", 404);
    }
    return { invitation, rawToken };
}
export async function cancelInvitation(db, invitationId) {
    const [invitation] = await db
        .update(workspaceInvitations)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(and(eq(workspaceInvitations.id, invitationId), eq(workspaceInvitations.status, "pending")))
        .returning();
    if (!invitation) {
        throw new InviteError("Pending invitation not found", "INVITE_NOT_FOUND", 404);
    }
    return invitation;
}
/**
 * Atomically redeem a pending, unexpired invite when the authenticated verified
 * email matches. Concurrent redeem races are resolved by compare-and-set on status.
 */
export async function redeemInvitation(db, input) {
    const verifiedEmail = normalizeEmail(input.verifiedEmail);
    const [invite] = await db
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, input.invitationId))
        .limit(1);
    if (!invite) {
        throw new InviteError("Invitation not found", "INVITE_NOT_FOUND", 404);
    }
    if (!verifyOpaqueToken(input.rawToken, invite.tokenHash)) {
        throw new InviteError("Invalid invitation token", "INVITE_TOKEN_INVALID", 403);
    }
    if (invite.email !== verifiedEmail) {
        throw new InviteError("Invite email does not match authenticated user", "INVITE_EMAIL_MISMATCH", 403);
    }
    if (invite.status === "accepted" && invite.acceptedByUserId === input.userId) {
        return {
            invitation: invite,
            membershipId: "",
            alreadyAccepted: true,
        };
    }
    if (invite.status !== "pending") {
        throw new InviteError(`Invitation is ${invite.status}`, "INVITE_NOT_PENDING");
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
        await db
            .update(workspaceInvitations)
            .set({ status: "expired", updatedAt: new Date() })
            .where(eq(workspaceInvitations.id, invite.id));
        throw new InviteError("Invitation expired", "INVITE_EXPIRED", 410);
    }
    const now = new Date();
    const membershipId = input.membershipId ?? newId("wm");
    const updated = await db.transaction(async (tx) => {
        const [cas] = await tx
            .update(workspaceInvitations)
            .set({
            status: "accepted",
            acceptedAt: now,
            acceptedByUserId: input.userId,
            updatedAt: now,
        })
            .where(and(eq(workspaceInvitations.id, invite.id), eq(workspaceInvitations.status, "pending"), gt(workspaceInvitations.expiresAt, now)))
            .returning();
        if (!cas) {
            const [again] = await tx
                .select()
                .from(workspaceInvitations)
                .where(eq(workspaceInvitations.id, invite.id))
                .limit(1);
            if (again?.status === "accepted" && again.acceptedByUserId === input.userId) {
                return { invitation: again, membershipId: "", alreadyAccepted: true };
            }
            throw new InviteError("Invitation already consumed", "INVITE_ALREADY_CONSUMED", 409);
        }
        await tx.insert(workspaceMembers).values({
            id: membershipId,
            workspaceId: cas.workspaceId,
            userId: input.userId,
            roleId: cas.roleId,
            invitedBy: cas.invitedByUserId,
            createdAt: now,
        });
        return { invitation: cas, membershipId, alreadyAccepted: false };
    });
    return updated;
}
export async function listPendingInvitations(db, workspaceId) {
    return db
        .select()
        .from(workspaceInvitations)
        .where(and(eq(workspaceInvitations.workspaceId, workspaceId), eq(workspaceInvitations.status, "pending"), gt(workspaceInvitations.expiresAt, new Date())));
}
export { workspaceInvitations };
