import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
/** System or workspace-scoped role. `workspace_id` null = global template role. */
export const workspaceRoles = pgTable("workspace_role", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    workspaceId: text("workspace_id"),
    rank: integer("rank").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("workspace_role_workspace_name_idx").on(table.workspaceId, table.name)]);
/** Feature gate identifier (e.g. `app.billing`). `workspace_id` null = global feature. */
export const workspaceFeatures = pgTable("workspace_feature", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    workspaceId: text("workspace_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("workspace_feature_workspace_name_idx").on(table.workspaceId, table.name)]);
/** Deny-by-default permission matrix. `workspace_id` null = global default for all workspaces. */
export const workspaceFeaturePermissions = pgTable("workspace_feature_permission", {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    roleId: text("role_id")
        .notNull()
        .references(() => workspaceRoles.id, { onDelete: "cascade" }),
    featureId: text("feature_id")
        .notNull()
        .references(() => workspaceFeatures.id, { onDelete: "cascade" }),
    allowed: boolean("allowed").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("workspace_feature_permission_scope_idx").on(table.workspaceId, table.roleId, table.featureId),
]);
