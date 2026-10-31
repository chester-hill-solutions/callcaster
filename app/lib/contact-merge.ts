import type { contact } from "@/db/schema";

export type ContactMergeProfile = typeof contact.$inferSelect;

export type ContactMergeEffects = {
  audiences: number;
  queues: number;
  calls: number;
  messages: number;
  outreachAttempts: number;
  surveyResponses: number;
  importReceipts: number;
  continuations: number;
};

export type ContactMergeReview = {
  retainedContactId: number;
  contacts: ContactMergeProfile[];
  optedOut: boolean;
  conflictingFields: string[];
  effects: ContactMergeEffects;
  version: string;
  requestId: string;
};

export type ContactMergeResult = {
  retainedContactId: number;
  mergedCount: number;
  requestId: string;
};
