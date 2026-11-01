import { ConferenceStartRefusedError, startConferenceAndDial, type StartConferenceParams } from "./services/hooks-api";
import type { AgentAudioStorage } from "./agent-audio-storage";
import { readDialerJournal, writeDialerJournal, type DialerJournal, type DialerOwner, type SavedDialerStart } from "./predictive-dialer-journal";
import { stopDialerRequest } from "./voice-dialer-stop-client";
import type { VoiceDialerCurrent } from "./schemas/api/voice-dialer-stop";

const UNKNOWN_START = "The dialer request is not confirmed. Check this request or stop this session before starting another.";
const PENDING_STOP = "Stop is not confirmed. Stay on this screen and retry Stop. No new call will start.";
const STORAGE_ERROR = "The saved dialer request could not be read. Check browser storage before starting another session.";
const CHECK_CURRENT = "The current dialing session is not confirmed. Check it before continuing.";
const INITIAL = { conference: null as string | null, customerCallSid: null as string | null, isLoading: false, isStopping: false,
  awaitingReceipt: false, pendingStartIntentId: null as string | null, stopPending: false, hasSession: false, currentVerified: false,
  error: null as string | null, creditsError: false };

/** Owns Start/Stop requests. Customer state remains in the campaign call flow. */
export class PredictiveDialer {
  private state = INITIAL;
  private listeners = new Set<() => void>();
  private journal: DialerJournal | null = null;
  private live = false;
  private lifetime = 0;
  private startOperation: symbol | null = null;
  private stopRequests = new Map<string, ReturnType<typeof stopDialerRequest>>();
  private stopped = new Set<string>();
  private recoveryAllowed = true;
  private storageReadable = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private refused: SavedDialerStart | null = null;
  readonly owner: Readonly<DialerOwner>;
  constructor(owner: DialerOwner, private storage: AgentAudioStorage) { this.owner = Object.freeze({ ...owner }); }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(patch: Partial<typeof INITIAL>) {
    if (!this.live) return;
    this.state = { ...this.state, ...patch, hasSession: this.journal !== null };
    for (const listener of this.listeners) listener();
  }
  private current(journal: DialerJournal, lifetime: number) { return this.live && this.lifetime === lifetime && this.journal === journal; }
  private save(journal: DialerJournal | null, expectedId: string | null): boolean {
    try { writeDialerJournal(this.storage, this.owner, journal, expectedId); return true; }
    catch { this.storageReadable = false; this.publish({ error: STORAGE_ERROR }); return false; }
  }
  mount() {
    this.live = true;
    const lifetime = ++this.lifetime;
    this.publish({ currentVerified: false });
    try {
      this.journal = readDialerJournal(this.storage, this.owner); this.storageReadable = true;
      const saved = this.journal;
      if (saved && !this.stopped.has(saved.intentId)) {
        if (saved.campaignId !== this.owner.campaignId) saved.state = "stopping";
        this.publish({ conference: saved.campaignId === this.owner.campaignId ? saved.conference : null,
          awaitingReceipt: saved.state === "starting", pendingStartIntentId: saved.state === "starting" ? saved.intentId : null,
          stopPending: saved.state === "stopping", isLoading: false, isStopping: false,
          error: saved.state === "starting" ? UNKNOWN_START : saved.state === "stopping" ? PENDING_STOP : null });
        if (saved.state === "stopping") { this.save(saved, saved.intentId); void this.sendStop(saved); }
      } else this.journal = null;
    } catch { this.storageReadable = false; this.publish({ error: STORAGE_ERROR }); }
    return () => {
      if (this.lifetime !== lifetime) return;
      this.live = false; this.startOperation = null; clearTimeout(this.retryTimer);
      const saved = this.journal;
      if (!saved) return;
      saved.state = "stopping"; this.save(saved, saved.intentId);
      void this.sendStop(saved, true);
    };
  }
  setConference = (conference: string | null) => {
    if (!this.live) return;
    this.recoveryAllowed = false;
    this.publish({ conference, ...(conference !== this.state.conference ? { customerCallSid: null } : {}) });
    // A room-ended event is not acknowledgement of the durable Stop.
  };
  restoreConference = (conference: string) => {
    if (!this.live || !this.recoveryAllowed || this.journal || this.state.conference) return;
    this.publish({ conference });
  };
  recover = (control: VoiceDialerCurrent | null, verified = true) => {
    if (!this.live) return;
    if (!verified || control && (control.workspace_id !== this.owner.workspaceId || control.user_id !== this.owner.userId)) {
      this.publish({ currentVerified: false }); return;
    }
    if (!control) { this.publish({ currentVerified: true, ...(this.state.error === CHECK_CURRENT ? { error: null } : {}) }); return; }
    if (this.stopped.has(control.intent_id)) return;
    const saved = this.journal;
    if (saved && (saved.intentId !== control.intent_id || saved.campaignId !== String(control.campaign_id)) || !saved && !this.recoveryAllowed) {
      this.publish({ currentVerified: false }); return;
    }
    const journal: DialerJournal = saved ?? { version: 1, ...this.owner, campaignId: String(control.campaign_id),
      intentId: control.intent_id, conference: control.conference_id, request: null, state: "active" };
    if (journal.conference && journal.conference !== control.conference_id) { this.publish({ currentVerified: false }); return; }
    journal.conference = control.conference_id;
    if (journal.state !== "stopping") journal.state = control.dialer_state === "stopping" ? "stopping" : "active";
    this.journal = journal; this.save(journal, saved?.intentId ?? null);
    this.publish({ currentVerified: true, conference: journal.campaignId === this.owner.campaignId ? journal.conference : null,
      awaitingReceipt: false, pendingStartIntentId: null, stopPending: journal.state === "stopping", error: journal.state === "stopping" ? PENDING_STOP
        : journal.campaignId !== this.owner.campaignId ? "Another campaign has an active dialing session. Stop it before starting this campaign." : null });
    if (journal.state === "stopping") void this.sendStop(journal);
  };
  private startRequest(request: Omit<StartConferenceParams, "dial_intent_id" | "actor_id">): SavedDialerStart {
    const refused = this.refused;
    const context = (value: typeof request) => JSON.stringify([value.caller_id, value.selected_device, value.audioSource?.connectionId, value.audioSource?.generation]);
    return refused && context(refused) === context(request) ? refused : { ...request, actor_id: this.owner.userId, dial_intent_id: crypto.randomUUID(),
      ...(request.audioSource ? { audioSource: { ...request.audioSource } } : {}) };
  }
  begin = async (request: Omit<StartConferenceParams, "dial_intent_id" | "actor_id">, disabledReason: string | null,
    showError?: (message: string, creditsError: boolean) => void) => {
    if (!this.live || this.startOperation || this.journal?.state === "stopping" || this.journal?.state === "active") return;
    if (!this.journal && !this.state.currentVerified) { this.publish({ error: CHECK_CURRENT }); return; }
    if (!this.storageReadable) { this.publish({ error: STORAGE_ERROR }); showError?.(STORAGE_ERROR, false); return; }
    if (disabledReason && !this.journal) { this.publish({ error: disabledReason }); showError?.(disabledReason, false); return; }
    this.recoveryAllowed = false;
    let journal = this.journal;
    if (!journal) {
      const saved = this.startRequest(request);
      journal = { version: 1, ...this.owner, intentId: saved.dial_intent_id, request: saved, conference: null, state: "starting" };
      if (!this.save(journal, null)) return;
      this.journal = journal;
    }
    const saved = journal.request;
    if (!saved) return;
    const operation = Symbol(), lifetime = this.lifetime;
    this.startOperation = operation;
    const ownsReply = () => this.current(journal, lifetime) && this.startOperation === operation && journal.state === "starting";
    this.publish({ isLoading: true, error: null, creditsError: false, pendingStartIntentId: journal.intentId });
    try {
      const result = await startConferenceAndDial(saved);
      if (!ownsReply()) return;
      if (result.creditsError) throw new ConferenceStartRefusedError("Insufficient credits to start dialing");
      if (!result.success || !result.conferenceName) throw new Error(result.error ?? UNKNOWN_START);
      journal.state = "active"; journal.conference = result.conferenceName;
      if (!this.save(journal, journal.intentId)) {
        journal.state = "stopping"; this.publish({ stopPending: true, awaitingReceipt: false, pendingStartIntentId: null });
        void this.sendStop(journal); return;
      }
      this.refused = null;
      this.publish({ conference: result.conferenceName, customerCallSid: result.callSid ?? null, awaitingReceipt: false, pendingStartIntentId: null });
    } catch (cause) {
      if (!ownsReply()) return;
      const definite = cause instanceof ConferenceStartRefusedError;
      const creditsError = definite && cause.message === "Insufficient credits to start dialing";
      if (definite) { this.refused = saved; if (this.save(null, journal.intentId)) this.journal = null; }
      const message = cause instanceof Error ? cause.message : UNKNOWN_START;
      this.publish({ error: message, creditsError, awaitingReceipt: !definite, pendingStartIntentId: definite ? null : journal.intentId });
      showError?.(message, creditsError);
    } finally {
      if (this.live && this.lifetime === lifetime && this.startOperation === operation) {
        this.startOperation = null; this.publish({ isLoading: false });
      }
    }
  };
  stop = async (): Promise<boolean> => {
    if (!this.live) return false;
    const journal = this.journal;
    if (!journal) {
      if (!this.state.currentVerified) this.publish({ error: CHECK_CURRENT });
      return !this.state.conference && this.storageReadable && this.state.currentVerified;
    }
    this.recoveryAllowed = false; this.startOperation = null;
    journal.state = "stopping"; this.save(journal, journal.intentId);
    this.publish({ stopPending: true, isLoading: false, awaitingReceipt: false, pendingStartIntentId: null, error: null });
    return this.sendStop(journal);
  };
  private async sendStop(journal: DialerJournal, keepalive = true): Promise<boolean> {
    const lifetime = this.lifetime;
    this.publish({ isStopping: true });
    const operation = this.stopRequests.get(journal.intentId) ?? stopDialerRequest(journal, keepalive);
    this.stopRequests.set(journal.intentId, operation);
    try {
      const result = await operation;
      if (result?.stop_state === "stopped") {
        this.stopped.add(journal.intentId);
        if (this.refused?.dial_intent_id === journal.intentId) this.refused = null;
        let cleared = false;
        try {
          const saved = readDialerJournal(this.storage, this.owner);
          if (!saved) cleared = true;
          else if (saved.intentId === journal.intentId && saved.state === "stopping") cleared = this.save(null, journal.intentId);
        } catch { /* A confirmed server Stop remains safe even if browser storage is unavailable. */ }
        if (this.current(journal, lifetime)) {
          this.journal = null;
          if (!cleared) this.storageReadable = false;
          this.publish({ conference: null, customerCallSid: null, isLoading: false, awaitingReceipt: false, pendingStartIntentId: null,
            stopPending: false, isStopping: false, error: cleared ? null : STORAGE_ERROR });
        }
        return true;
      }
      if (this.current(journal, lifetime)) this.publish({ stopPending: true, isStopping: false, error: PENDING_STOP });
      return false;
    } finally {
      if (this.stopRequests.get(journal.intentId) === operation) this.stopRequests.delete(journal.intentId);
      clearTimeout(this.retryTimer);
      if (this.current(journal, lifetime) && journal.state === "stopping" && !this.stopped.has(journal.intentId))
        this.retryTimer = setTimeout(() => { void this.sendStop(journal); }, 3000);
    }
  }
}
