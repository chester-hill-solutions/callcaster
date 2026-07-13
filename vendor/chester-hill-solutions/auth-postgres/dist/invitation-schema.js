import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
/**
 * Email-first workspace invitation. Store only `tokenHash` (SHA-256 hex);
 * never persist the raw opaque token. FK to workspace is enforced in DDL.
 */
export const workspaceInvitations = pgTable("workspace_invitation", {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    email: text("email").notNull(),
    roleId: text("role_id").notNull(),
    invitedByUserId: text("invited_by_user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status", {
        enum: ["pending", "accepted", "canceled", "expired", "superseded"],
    })
        .notNull()
        .default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    acceptedByUserId: text("accepted_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
