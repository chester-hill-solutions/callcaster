export type WorkspaceTwilioSyncStatus =
  | "never_synced"
  | "syncing"
  | "healthy"
  | "error";

export interface WorkspaceTwilioSyncSnapshot {
  accountStatus: string | null;
  accountFriendlyName: string | null;
  phoneNumberCount: number;
  /** Capability flags observed on workspace numbers (sms, mms, voice). */
  numberTypes: string[];
  /** Twilio sender taxonomy inferred from phone inventory (toll_free, local, …). */
  senderTypes: string[];
  recentUsageCount: number;
  usageTotalPrice: number | null;
  lastSyncedAt: string | null;
  lastSyncStatus: WorkspaceTwilioSyncStatus;
  lastSyncError: string | null;
  /** True when toll-free verification blocks bulk SMS for synced inventory. */
  tollFreeVerificationBlocked?: boolean;
  /** Set only after a complete successful inventory and verification check. */
  tollFreeVerificationCheckedAt?: string | null;
}
