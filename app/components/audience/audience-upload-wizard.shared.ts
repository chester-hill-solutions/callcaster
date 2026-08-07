export const AUDIENCE_UPLOAD_WIZARD_STEPS = [
  { id: "file", label: "1. Select file" },
  { id: "map", label: "2. Map columns" },
  { id: "review", label: "3. Upload" },
] as const;

export type AudienceUploadWizardStepId =
  (typeof AUDIENCE_UPLOAD_WIZARD_STEPS)[number]["id"];

export type AudienceUploadWizardStepVisual = "current" | "complete" | "upcoming";

export const AUDIENCE_UPLOAD_WIZARD_STEP_BASE =
  "inline-flex h-7 items-center rounded-sm px-2.5 text-xs font-medium transition-colors";

export const audienceUploadWizardStepToneClass: Record<
  AudienceUploadWizardStepVisual,
  string
> = {
  current: "bg-muted text-foreground",
  complete: "text-brand-primary",
  upcoming: "text-muted-foreground",
};

export const PHONE_SKIP_HINT =
  "Contacts need a valid phone number to dial or message. Rows without one are left out of the import.";

export const OPT_OUT_HINT =
  "Opt-out status marks contacts who should not be contacted. Map a column if your file includes unsubscribe or do-not-contact flags.";

export const PREVIEW_ROW_COUNT = 5;
