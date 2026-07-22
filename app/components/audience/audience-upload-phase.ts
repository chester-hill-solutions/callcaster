import type { ContactImportTarget } from "../../../shared/contact-import-headers";

export type AudienceUploadDraft = {
  file: File;
  fileName: string;
  headers: string[];
  previewRows: Record<string, string>[];
  rowCount: number;
  headerMapping: Record<string, ContactImportTarget>;
  splitNameColumn: string | null;
};

export type AudienceUploadWizardKind = "file" | "map" | "review";

/** Server snapshot shared by poll + realtime. */
export type AudienceUploadServerSnapshot = {
  status?: string | null;
  total_contacts?: number | null;
  processed_contacts?: number | null;
  error_message?: string | null;
  audience_id?: string | number | null;
  stage?: string | null;
};

export type AudienceUploadProgressStatus =
  | "submitting"
  | "processing"
  | "completed"
  | "error";

export type AudienceUploadProgressState =
  | { kind: "idle" }
  | {
      kind: "submitting";
      totalContacts: number;
      processedContacts: number;
      progress: number;
      warning: string | null;
    }
  | {
      kind: "processing";
      uploadId: number;
      audienceId: string | null;
      totalContacts: number;
      processedContacts: number;
      progress: number;
      warning: string | null;
    }
  | {
      kind: "completed";
      audienceId: string;
      totalContacts: number;
      processedContacts: number;
      progress: number;
    }
  | {
      kind: "error";
      message: string;
    };

/**
 * Single UI phase derived from wizard step + upload progress.
 * Upload lifecycle always supersedes the pre-upload wizard.
 */
export type AudienceUploadPhase =
  | { kind: "file" }
  | { kind: "map"; draft: AudienceUploadDraft }
  | { kind: "review"; draft: AudienceUploadDraft }
  | {
      kind: "submitting";
      draft: AudienceUploadDraft;
      totalContacts: number;
      processedContacts: number;
      progress: number;
      warning: string | null;
    }
  | {
      kind: "processing";
      draft: AudienceUploadDraft;
      uploadId: number;
      audienceId: string | null;
      totalContacts: number;
      processedContacts: number;
      progress: number;
      warning: string | null;
    }
  | {
      kind: "completed";
      audienceId: string;
      totalContacts: number;
      processedContacts: number;
      progress: number;
    }
  | {
      kind: "error";
      draft: AudienceUploadDraft;
      message: string;
    };

export function resolveAudienceUploadPhase(args: {
  wizard: AudienceUploadWizardKind;
  draft: AudienceUploadDraft | null;
  progress: AudienceUploadProgressState;
}): AudienceUploadPhase {
  const { wizard, draft, progress } = args;

  switch (progress.kind) {
    case "submitting":
      if (!draft) return { kind: "file" };
      return {
        kind: "submitting",
        draft,
        totalContacts: progress.totalContacts,
        processedContacts: progress.processedContacts,
        progress: progress.progress,
        warning: progress.warning,
      };
    case "processing":
      if (!draft) return { kind: "file" };
      return {
        kind: "processing",
        draft,
        uploadId: progress.uploadId,
        audienceId: progress.audienceId,
        totalContacts: progress.totalContacts,
        processedContacts: progress.processedContacts,
        progress: progress.progress,
        warning: progress.warning,
      };
    case "completed":
      return {
        kind: "completed",
        audienceId: progress.audienceId,
        totalContacts: progress.totalContacts,
        processedContacts: progress.processedContacts,
        progress: progress.progress,
      };
    case "error":
      if (!draft) return { kind: "file" };
      return { kind: "error", draft, message: progress.message };
    case "idle":
      break;
    default: {
      const _exhaustive: never = progress;
      return _exhaustive;
    }
  }

  switch (wizard) {
    case "file":
      return { kind: "file" };
    case "map":
      if (!draft) return { kind: "file" };
      return { kind: "map", draft };
    case "review":
      if (!draft) return { kind: "file" };
      return { kind: "review", draft };
    default: {
      const _exhaustive: never = wizard;
      return _exhaustive;
    }
  }
}

export function audienceUploadProgressLabel(
  status: AudienceUploadProgressStatus,
): string {
  switch (status) {
    case "submitting":
      return "Submitting...";
    case "processing":
      return "Processing...";
    case "completed":
      return "Completed!";
    case "error":
      return "Error";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function wizardStepIndex(wizard: AudienceUploadWizardKind): number {
  switch (wizard) {
    case "file":
      return 0;
    case "map":
      return 1;
    case "review":
      return 2;
    default: {
      const _exhaustive: never = wizard;
      return _exhaustive;
    }
  }
}
