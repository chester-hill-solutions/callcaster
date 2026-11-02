import { useEffect, useMemo, useState } from "react";
import { fetchCampaignQueueItemWithContact } from "@/lib/chats/messaging-client";
import type { RecoveredCallCustomer } from "@/lib/schemas/api/voice-audio";
import type { OutreachAttempt, QueueItem } from "@/lib/types";

type Subject = { key: string; contact: QueueItem | null; error: string | null };

function matchesAttempt(customer: RecoveredCallCustomer, attempt: OutreachAttempt) {
  return attempt.id === customer.outreach_attempt_id && attempt.workspace === customer.workspace_id &&
    attempt.user_id === customer.user_id && attempt.campaign_id === customer.campaign_id && attempt.contact_id === customer.contact_id;
}
function findAttempt(customer: RecoveredCallCustomer | null, attempts: OutreachAttempt[]) {
  return customer ? attempts.find(attempt => matchesAttempt(customer, attempt)) : undefined;
}
function changedAttempt(customer: RecoveredCallCustomer | null, current: OutreachAttempt | null, entry: OutreachAttempt | null) {
  return customer && current && current !== entry && matchesAttempt(customer, current) ? current : null;
}

/** Resolve the dequeued contact without returning it to the waiting queue. */
export function useRecoveredPredictiveSubject(customer: RecoveredCallCustomer | null, attempts: OutreachAttempt[], recentAttempt: OutreachAttempt | null = null) {
  const key = customer ? JSON.stringify([customer.workspace_id, customer.user_id, customer.campaign_id,
    customer.conference_id, customer.call_sid, customer.queue_id, customer.contact_id, customer.outreach_attempt_id]) : "";
  const [subject, setSubject] = useState<Subject>({ key: "", contact: null, error: null });
  const owns = Boolean(key);
  // Identity fields alone start the read. Repeated snapshots and edited answers do not reset this subject.
  const workspace = customer?.workspace_id, campaign = customer?.campaign_id, queue = customer?.queue_id, contact = customer?.contact_id;
  /**
   * @effect Resolve the exact saved queue row, including a dequeued row, for the current call owner.
   * @effect-deps key, workspace, campaign, queue, contact (one immutable call subject).
   * @effect-side-effects fetch (read only), state; cleanup rejects late replies after an owner change or unmount.
   * @effect-why-not-loader This customer can arrive after mount through current audio discovery or SSE recovery.
   */
  useEffect(() => {
    if (!key || !workspace || !campaign || !queue || !contact) return;
    let active = true;
    void fetchCampaignQueueItemWithContact(campaign, queue).then(item => {
      if (!active) return;
      if (!item || item.id !== queue || item.workspace !== workspace || item.campaign_id !== campaign ||
        item.contact_id !== contact || item.contact.id !== contact || item.contact.workspace !== workspace)
        throw new Error("The saved contact could not be confirmed. Refresh the call before saving.");
      setSubject({ key, contact: item, error: null });
    }).catch(() => {
      if (active) setSubject({ key, contact: null, error: "The saved contact could not be confirmed. Refresh the call before saving." });
    });
    return () => { active = false; };
  }, [key, workspace, campaign, queue, contact]);

  const saved = subject.key === key ? subject : null;
  const liveAttempt = findAttempt(customer, attempts);
  // Loader rows can predate discovery. Only a later replacement row supersedes the saved result.
  const [entry, setEntry] = useState({ key, attempt: liveAttempt, recent: recentAttempt });
  if (entry.key !== key) setEntry({ key, attempt: liveAttempt, recent: recentAttempt });
  const recoveredAttempt = useMemo<OutreachAttempt | null>(() => customer ? { ...customer.attempt, call: [] } : null, [customer]);
  const editedAttempt = changedAttempt(customer, recentAttempt, entry.recent);
  const attempt = !saved?.contact ? null : editedAttempt ?? (liveAttempt && liveAttempt !== entry.attempt ? liveAttempt : recoveredAttempt);
  return { key, owns, contact: saved?.contact ?? null, attempt,
    pending: owns && !saved, error: saved?.error ?? null };
}

type CallSubject = { nextRecipient: QueueItem | null; questionContact: QueueItem | null; recentAttempt: OutreachAttempt | null;
  disposition: string; update: Record<string, unknown> | null };
export function recoveredSubjectView(subject: ReturnType<typeof useRecoveredPredictiveSubject>, original: CallSubject): CallSubject {
  if (!subject.owns) return original;
  return { nextRecipient: subject.contact, questionContact: subject.contact, recentAttempt: subject.attempt,
    disposition: subject.attempt?.disposition ?? "idle",
    update: original.questionContact?.contact_id === subject.contact?.contact_id ? original.update : null };
}
