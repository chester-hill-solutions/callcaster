import { useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger.client";
import {
  suggestContactImportMapping,
  validateContactImportMapping,
  type ContactImportTarget,
} from "../../../shared/contact-import-headers";
import { AudienceUploadFileStep } from "./AudienceUploadFileStep";
import { AudienceUploadMapStep } from "./AudienceUploadMapStep";
import { AudienceUploadReviewStep } from "./AudienceUploadReviewStep";
import { AudienceUploadProgressPanel } from "./AudienceUploadProgressPanel";
import { parseCSVAsync } from "./audience-upload-csv";
import {
  resolveAudienceUploadPhase,
  wizardStepIndex,
  type AudienceUploadDraft,
  type AudienceUploadWizardKind,
} from "./audience-upload-phase";
import {
  AUDIENCE_UPLOAD_WIZARD_STEPS,
  AUDIENCE_UPLOAD_WIZARD_STEP_BASE,
  PREVIEW_ROW_COUNT,
  audienceUploadWizardStepToneClass,
  type AudienceUploadWizardStepVisual,
} from "./audience-upload-wizard.shared";
import { useAudienceUploadProgress } from "./use-audience-upload-progress";
import { useTimeoutFn } from "@/hooks/utils/useTimeoutFn";

type AudienceUploaderProps = {
  audienceName?: string;
  existingAudienceId?: string;
  campaignId?: string;
  returnTo?: string | null;
  onUploadComplete?: (audienceId: string) => void;
};

export default function AudienceUploader({
  audienceName = "",
  existingAudienceId,
  campaignId,
  returnTo,
  onUploadComplete,
}: AudienceUploaderProps) {
  const params = useParams();
  const workspaceId = params["id"];
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scheduleRedirect = useTimeoutFn();

  const [wizard, setWizard] = useState<AudienceUploadWizardKind>("file");
  const [draft, setDraft] = useState<AudienceUploadDraft | null>(null);

  const embedded = Boolean(onUploadComplete);

  const {
    progress,
    startSubmitting,
    beginProcessing,
    fail,
    reset: resetProgress,
  } = useAudienceUploadProgress({
    workspaceId,
    existingAudienceId,
    onUploadComplete,
    onStandaloneComplete: (audienceId) => {
      scheduleRedirect(2000, () => {
        navigate(
          returnTo ?? `/workspaces/${workspaceId}/audiences/${audienceId}`,
        );
      });
    },
  });

  const phase = resolveAudienceUploadPhase({ wizard, draft, progress });

  const mappingIssues = useMemo(
    () =>
      draft ? validateContactImportMapping(draft.headerMapping) : [],
    [draft],
  );
  const hasBlockingMappingIssue = mappingIssues.some((issue) => issue.blocking);
  const hasOptOutMapped = draft
    ? Object.values(draft.headerMapping).includes("opt_out")
    : false;
  const nameMappedHeader = draft
    ? (Object.entries(draft.headerMapping).find(
        ([, target]) => target === "name",
      )?.[0] ?? null)
    : null;

  const resetFileState = () => {
    setDraft(null);
    setWizard("file");
    resetProgress();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const displayFileToUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const data = await file.text();
    if (!data) return;

    const { contacts, headers } = await parseCSVAsync(data);

    const cleanPreviewData = contacts
      .slice(0, PREVIEW_ROW_COUNT)
      .map((contact) => {
        const cleanContact: Record<string, string> = {};
        headers.forEach((header) => {
          const value = contact[header];
          cleanContact[header] =
            value === "null" || value === undefined || value === null
              ? ""
              : String(value);
        });
        return cleanContact;
      });

    const initialMapping = suggestContactImportMapping(headers);
    const nameColumnHeader = headers.find(
      (header) => initialMapping[header] === "name",
    );

    setDraft({
      file,
      fileName: file.name,
      headers,
      previewRows: cleanPreviewData,
      rowCount: contacts.length,
      headerMapping: initialMapping,
      splitNameColumn: nameColumnHeader ?? null,
    });
    setWizard("map");
  };

  const updateHeaderMapping = (
    originalHeader: string,
    newMapping: ContactImportTarget,
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextMapping = {
        ...prev.headerMapping,
        [originalHeader]: newMapping,
      };
      let splitNameColumn = prev.splitNameColumn;
      if (newMapping === "name") {
        splitNameColumn = originalHeader;
      } else if (splitNameColumn === originalHeader) {
        splitNameColumn = null;
      }
      return { ...prev, headerMapping: nextMapping, splitNameColumn };
    });
  };

  const handleUploadContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !workspaceId) return;

    startSubmitting(draft.rowCount);

    try {
      const formData = new FormData();
      formData.append("workspace_id", workspaceId);

      if (existingAudienceId) {
        formData.append("audience_id", existingAudienceId);
      } else {
        formData.append("audience_name", audienceName);
      }

      formData.append("contacts", draft.file);
      formData.append("header_mapping", JSON.stringify(draft.headerMapping));
      if (campaignId) {
        formData.append("campaign_id", campaignId);
      }
      if (draft.splitNameColumn) {
        formData.append("split_name_column", draft.splitNameColumn);
      }

      const response = await fetch("/api/audience-upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Upload request failed");
      }

      beginProcessing({
        uploadId: data.upload_id,
        audienceId: String(data.audience_id),
        totalContacts: draft.rowCount,
      });
    } catch (error) {
      logger.error("Upload error:", error);
      fail(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    }
  };

  const currentStepIdx = wizardStepIndex(
    phase.kind === "map" || phase.kind === "review" || phase.kind === "file"
      ? phase.kind
      : wizard,
  );

  const showStepStrip = !embedded;

  return (
    <div className="space-y-6">
      {showStepStrip ? (
        <ol className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1 text-xs">
          {AUDIENCE_UPLOAD_WIZARD_STEPS.map((s, idx) => {
            const isCurrent =
              phase.kind === "file" ||
              phase.kind === "map" ||
              phase.kind === "review"
                ? s.id === phase.kind
                : s.id === "review";
            const isComplete = idx < currentStepIdx || phase.kind === "completed";
            const visual: AudienceUploadWizardStepVisual = isCurrent
              ? "current"
              : isComplete
                ? "complete"
                : "upcoming";
            return (
              <li
                key={s.id}
                className={cn(
                  AUDIENCE_UPLOAD_WIZARD_STEP_BASE,
                  audienceUploadWizardStepToneClass[visual],
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                {s.label}
              </li>
            );
          })}
        </ol>
      ) : null}

      {(() => {
        switch (phase.kind) {
          case "file":
            return (
              <AudienceUploadFileStep
                ref={fileInputRef}
                onFileChange={displayFileToUpload}
              />
            );
          case "map":
            return (
              <AudienceUploadMapStep
                fileName={phase.draft.fileName}
                rowCount={phase.draft.rowCount}
                headers={phase.draft.headers}
                headerMapping={phase.draft.headerMapping}
                previewRows={phase.draft.previewRows}
                mappingIssues={mappingIssues}
                hasBlockingMappingIssue={hasBlockingMappingIssue}
                hasOptOutMapped={hasOptOutMapped}
                onHeaderMappingChange={updateHeaderMapping}
                onContinue={() => {
                  if (hasBlockingMappingIssue) return;
                  setWizard("review");
                }}
                onChooseAnotherFile={resetFileState}
              />
            );
          case "review":
            return (
              <AudienceUploadReviewStep
                fileName={phase.draft.fileName}
                rowCount={phase.draft.rowCount}
                columnCount={phase.draft.headers.length}
                showSplitNameOption={Boolean(nameMappedHeader)}
                splitNameEnabled={Boolean(phase.draft.splitNameColumn)}
                onSplitNameChange={(enabled) => {
                  setDraft((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      splitNameColumn:
                        enabled && nameMappedHeader ? nameMappedHeader : null,
                    };
                  });
                }}
                onStartUpload={handleUploadContacts}
                onBackToMapping={() => setWizard("map")}
              />
            );
          case "submitting":
            return (
              <AudienceUploadProgressPanel
                status="submitting"
                progress={phase.progress}
                processedContacts={phase.processedContacts}
                totalContacts={phase.totalContacts}
                warning={phase.warning}
                showCompletionChrome
                onTryAgain={resetProgress}
              />
            );
          case "processing":
            return (
              <AudienceUploadProgressPanel
                status="processing"
                progress={phase.progress}
                processedContacts={phase.processedContacts}
                totalContacts={phase.totalContacts}
                warning={phase.warning}
                skippedInvalidContacts={phase.skippedInvalidContacts}
                skippedDuplicateContacts={phase.skippedDuplicateContacts}
                showCompletionChrome
                onTryAgain={resetProgress}
              />
            );
          case "completed":
            if (embedded) {
              return null;
            }
            return (
              <AudienceUploadProgressPanel
                status="completed"
                progress={phase.progress}
                processedContacts={phase.processedContacts}
                totalContacts={phase.totalContacts}
                skippedInvalidContacts={phase.skippedInvalidContacts}
                skippedDuplicateContacts={phase.skippedDuplicateContacts}
                showCompletionChrome
                onTryAgain={resetProgress}
              />
            );
          case "error":
            return (
              <AudienceUploadProgressPanel
                status="error"
                progress={0}
                processedContacts={0}
                totalContacts={phase.draft.rowCount}
                errorMessage={phase.message}
                showCompletionChrome
                onTryAgain={() => {
                  resetProgress();
                  setWizard("review");
                }}
              />
            );
          default: {
            const _exhaustive: never = phase;
            return _exhaustive;
          }
        }
      })()}
    </div>
  );
}
