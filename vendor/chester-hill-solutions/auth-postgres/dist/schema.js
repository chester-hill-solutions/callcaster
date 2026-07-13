import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
export { account, accountRelations, session, sessionRelations, user, userRelations, verification, } from "./auth-schema.js";
/** Schema object for drizzleAdapter({ schema: authSchema }) */
export { authSchema } from "./auth-schema.js";
export { workspaceRoles, workspaceFeatures, workspaceFeaturePermissions, } from "./workspace-authz-schema.js";
export { workspaceInvitations, } from "./invitation-schema.js";
// ── Workspace tenancy ──────────────────────────────────────────────
export const workspaces = pgTable("workspace", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const workspaceMembers = pgTable("workspace_member", {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    roleId: text("role_id").notNull(),
    invitedBy: text("invited_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
