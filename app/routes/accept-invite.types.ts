import type { Database } from "@/lib/database.types";

export type WorkspaceInviteRow = Database["public"]["Tables"]["workspace_invite"]["Row"];
export type WorkspaceRow = Database["public"]["Tables"]["workspace"]["Row"];
export type ExistingUserInvite = Omit<WorkspaceInviteRow, "workspace"> & {
  workspace: Pick<WorkspaceRow, "id" | "name">;
};

export type LoaderData =
  | {
      status: "verified";
      invites: WorkspaceInviteRow[];
      email: string;
    }
  | {
      status: "existing_user";
      invites: ExistingUserInvite[];
      email: string;
    }
  | {
      status: "invalid_link";
      error: string;
    }
  | {
      status: "not_signed_in";
    }
  | {
      status: "error";
      error: string;
    };

export type AcceptInvitationError = {
  invitationId: unknown;
  type: string;
};

export type ActionData =
  | {
      status: "updated";
      invites: WorkspaceInviteRow[];
    }
  | {
      status: "accepted";
    }
  | {
      status: "accept_failed";
      errors: AcceptInvitationError[];
    }
  | {
      status: "error";
      error: string;
    };

export type RawInviteWithWorkspace = Omit<WorkspaceInviteRow, "workspace"> & {
  workspace:
    | (Pick<WorkspaceRow, "id" | "name"> & {
        name: WorkspaceRow["name"] | null;
      })
    | null;
};
