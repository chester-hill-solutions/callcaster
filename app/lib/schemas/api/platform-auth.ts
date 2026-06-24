import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
});

export const tokenBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshBodySchema = z.object({
  refresh_token: z.string().min(1),
});

export const forgotPasswordBodySchema = z.object({
  email: z.string().email(),
});

export const resetPasswordBodySchema = z.object({
  password: z.string().min(8),
  confirm_password: z.string().min(8),
});

export const verifyEmailBodySchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum([
    "signup",
    "invite",
    "magiclink",
    "recovery",
    "email_change",
    "email",
  ]),
});

export const acceptInvitesBodySchema = z.object({
  invitation_ids: z.array(z.string().uuid()).min(1),
});

export const updateMeBodySchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
});

export const createWorkspaceBodySchema = z.object({
  name: z.string().min(1).max(200),
});

export const updateWorkspaceBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

export const transferOwnershipBodySchema = z.object({
  new_owner_user_id: z.string().uuid(),
});

const workspaceOnboardingChannelSchema = z.enum([
  "a2p10dlc",
  "rcs",
  "voice_compliance",
]);

const workspaceOnboardingStatusSchema = z.enum([
  "not_started",
  "collecting_business",
  "provisioning",
  "submitting",
  "in_review",
  "approved",
  "rejected",
  "live",
]);

export const patchOnboardingBodySchema = z
  .object({
    current_step: z.string().min(1).optional(),
    selected_channels: z.array(workspaceOnboardingChannelSchema).optional(),
    status: workspaceOnboardingStatusSchema.optional(),
  })
  .refine(
    (value) =>
      value.current_step !== undefined ||
      value.selected_channels !== undefined ||
      value.status !== undefined,
    { message: "At least one onboarding field is required." },
  );

export const onboardingActionBodySchema = z
  .object({
    action: z.enum([
      "save_channels",
      "bootstrap_messaging_service",
      "save_business_profile",
      "review_emergency_voice",
      "provision_a2p",
      "save_rcs",
      "advance_step",
      "skip_first_number",
      "verify_caller_id",
    ]),
  })
  .passthrough();
