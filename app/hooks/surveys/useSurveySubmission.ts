import { useEffect, useRef, useState } from "react";
import { submitForm } from "@/lib/api-client";
import { isObject } from "@/lib/type-safety-utils";

type AnswerStatus = "pending" | "saving" | "saved" | "error";
type PendingAnswer = { questionId: string; pageId: string; value: string | string[] };
type SurveyIdentity = { surveyId: string; resultId: string; respondentToken: string; contactId: number | null };

/** Owns the write queue for one keyed respondent; saves must acknowledge before completion. */
export function useSurveySubmission(identity: SurveyIdentity) {
  const pending = useRef(new Map<string, PendingAnswer>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const [statuses, setStatuses] = useState<Record<string, AnswerStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  /**
   * @effect Own the respondent's pending timer and request cancellation lifetime.
   * @effect-deps none — the route keys this hook's owner by survey/respondent identity
   * @effect-side-effects clears pending timers and aborts requests on owner unmount
   * @effect-why-not-loader Browser resource cleanup belongs to the mounted respondent form.
   */
  useEffect(() => {
    alive.current = true;
    const answers = pending.current;
    return () => {
      alive.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      answers.clear();
      controller.current?.abort();
    };
  }, []);

  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  function answerKey(pageId: string, questionId: string) {
    return JSON.stringify([pageId, questionId]);
  }

  function setStatus(entry: PendingAnswer, status: AnswerStatus) {
    const key = answerKey(entry.pageId, entry.questionId);
    if (alive.current) setStatuses(current => ({ ...current, [key]: status }));
  }

  function identityForm() {
    const form = new FormData();
    form.set("surveyId", identity.surveyId);
    form.set("resultId", identity.resultId);
    form.set("respondent_token", identity.respondentToken);
    return form;
  }

  async function post(form: FormData, endpoint: "/api/survey-answer" | "/api/survey-complete") {
    controller.current ??= new AbortController();
    const response = await submitForm<unknown>(form, endpoint, { signal: controller.current.signal });
    if (!alive.current) throw new Error("Survey form closed");
    const payload = response.data;
    if (!response.success || !isObject(payload) || payload.success !== true) {
      const message = response.error?.message ?? (isObject(payload) && typeof payload.error === "string" ? payload.error : "Your response could not be saved. Try again.");
      throw new Error(message);
    }
  }

  async function drain() {
    while (alive.current && pending.current.size > 0) {
      const entry = pending.current.values().next().value;
      if (!entry) break;
      const form = identityForm();
      form.set("questionId", entry.questionId);
      form.set("pageId", entry.pageId);
      form.set("contactId", identity.contactId?.toString() ?? "");
      form.set("answerValue", Array.isArray(entry.value) ? JSON.stringify(entry.value) : entry.value);
      setStatus(entry, "saving");
      try {
        await post(form, "/api/survey-answer");
      } catch (failure) {
        setStatus(entry, "error");
        if (alive.current) setError(failure instanceof Error ? failure.message : "Your answer could not be saved. Try again.");
        throw failure;
      }
      if (pending.current.get(answerKey(entry.pageId, entry.questionId)) === entry) {
        pending.current.delete(answerKey(entry.pageId, entry.questionId));
        setStatus(entry, "saved");
      }
    }
  }

  function flushPending() {
    clearTimer();
    if (!running.current) running.current = drain().finally(() => { running.current = null; });
    return running.current;
  }

  function queueAnswer(entry: PendingAnswer) {
    if (!alive.current || busy.current) return;
    pending.current.set(answerKey(entry.pageId, entry.questionId), entry);
    setStatus(entry, "pending");
    setError(null);
    clearTimer();
    // The Map retains other questions and any edit that arrives during a write.
    timer.current = setTimeout(() => { void flushPending().catch(() => {}); }, 1000);
  }

  async function savePage(complete = false): Promise<boolean> {
    if (!alive.current || busy.current) return false;
    busy.current = true;
    setIsBusy(true);
    setError(null);
    try {
      await flushPending();
      if (!alive.current) return false;
      if (complete) {
        const form = identityForm();
        form.set("completed", "true");
        await post(form, "/api/survey-complete");
        setIsCompleted(true);
      }
      return true;
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : "Your response could not be saved. Try again.");
      return false;
    } finally {
      busy.current = false;
      if (alive.current) setIsBusy(false);
    }
  }

  return { queueAnswer, savePage, statusFor: (pageId: string, questionId: string) => statuses[answerKey(pageId, questionId)], error, isBusy, isCompleted };
}
