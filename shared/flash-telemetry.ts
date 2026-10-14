import { z } from "zod";

export const flashSeveritySchema = z.enum(["neutral", "info", "success", "warning", "error"]);
export type FlashSeverity = z.infer<typeof flashSeveritySchema>;

const breadcrumbSchema = z.object({
  t: z.number().finite(),
  kind: z.string().max(60),
  detail: z.string().max(220),
});
export type FlashBreadcrumb = z.infer<typeof breadcrumbSchema>;

const toastSeverities = { "toast-error": "error", "toast-warning": "warning", "alert-banner": undefined } as const;

const flashEventSchema = z.object({
  kind: z.enum(["toast-error", "toast-warning", "alert-banner"]),
  severity: flashSeveritySchema.optional(),
  message: z.string().max(520),
  stack: z.string().max(4100).optional(),
  breadcrumbs: z.array(breadcrumbSchema).max(50),
  url: z.string().max(320),
  ts: z.string().max(40),
}).superRefine((event, ctx) => {
  const toastSeverity = toastSeverities[event.kind];
  if (toastSeverity && event.severity && event.severity !== toastSeverity) {
    ctx.addIssue({ code: "custom", path: ["severity"], message: "Severity must match the toast kind." });
  }
}).transform(event => ({
  ...event,
  // Older clients identify toast meaning, but their banners are unclassified.
  severity: event.severity ?? toastSeverities[event.kind],
}));

export type FlashEvent = z.infer<typeof flashEventSchema>;
export const clientFlashBodySchema = z.object({ events: z.array(flashEventSchema).min(1).max(10) });

export function flashLogLevel(severity: FlashSeverity | undefined): "error" | "warn" | "info" {
  return severity === "error" ? "error" : severity === "warning" ? "warn" : "info";
}
