import { connectVoiceAudio, isVoiceAudioEffective, matchesVoiceAudioConnection, voiceAudioConnectRequestSchema,
  type VoiceAudioConnectRequest, type VoiceAudioOwner } from "@/lib/voice-audio-client";
import { cancelVoiceAudioIntent, readVoiceAudioIntent } from "@/lib/voice-audio-intent-client";
import type { PredictiveCustomerRecovery, RecoveredManualCustomer, VoiceAudioCurrentSnapshot, VoiceAudioIntentSnapshot, VoiceAudioSnapshot } from "@/lib/schemas/api/voice-audio";
import { currentVoiceAudioRequest, matchesCurrentVoiceAudioRequest, readCurrentVoiceAudio } from "@/lib/voice-audio-current-client";
import { agentAudioRequestDevice, readAgentAudioJournal, writeAgentAudioJournal,
  type AgentAudioJournal, type AgentAudioStorage } from "@/lib/agent-audio-storage";
import type { VoiceDialerCurrent } from "@/lib/schemas/api/voice-dialer-stop";

type AudioSlot = { request: VoiceAudioConnectRequest; connection: VoiceAudioSnapshot | null; cancelRequested: boolean; returningBrowser: boolean };
type AudioRecovery = { slot: AudioSlot; connection: VoiceAudioSnapshot; cancelRequested: boolean };
type PendingRecoveryPolicy = "normal" | "canceling" | "conflict";
export type AgentAudioState = {
  restoring: boolean;
  selectedDevice: string;
  active: VoiceAudioSnapshot | null;
  pendingDevice: string | null;
  cancelRequested: boolean;
  preparingBrowser: boolean;
  recoveryRequired: boolean;
  customerPending: boolean;
  predictiveRecovery: PredictiveCustomerRecovery | null;
  manualRecovery: RecoveredManualCustomer | null;
  dialerRecovery: VoiceDialerCurrent | null;
  currentVerified: boolean;
  error: string | null;
};

const INITIAL_STATE: AgentAudioState = { restoring: true, selectedDevice: "computer", active: null,
  pendingDevice: null, cancelRequested: false, preparingBrowser: false, recoveryRequired: false, customerPending: false,
  predictiveRecovery: null, manualRecovery: null, dialerRecovery: null, currentVerified: false, error: null };
const FINISHED_STATES = new Set(["canceled", "failed", "retired"]);

/** Owns agent audio requests and recovery, never the customer's call lifecycle. */
export class AgentAudioConnection {
  private state = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private active: AudioSlot | null = null;
  private pending: AudioSlot | null = null;
  private live = false;
  private lifetime = 0;
  private reading: number | null = null;
  private refreshPromise: Promise<void> | null = null;
  private discovering = true;
  private posting = new Set<string>();
  private finishedIntents = new Set<string>();
  private poll: ReturnType<typeof setTimeout> | undefined;
  private browserRequest: VoiceAudioConnectRequest | null = null;
  private browserSource: AudioSlot | null = null;
  readonly owner: Readonly<VoiceAudioOwner>;
  constructor(owner: VoiceAudioOwner, private readonly storage: AgentAudioStorage) { this.owner = Object.freeze({ ...owner }); }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };

  private publish(patch: Partial<Omit<AgentAudioState, "restoring" | "active" | "pendingDevice" | "cancelRequested">>) {
    if (!this.live) return;
    this.state = { ...this.state, ...patch, active: this.active?.connection ?? null,
      restoring: this.discovering,
      pendingDevice: this.pending ? this.pending.returningBrowser ? "computer" : agentAudioRequestDevice(this.pending.request) : null,
      cancelRequested: this.pending?.cancelRequested ?? false };
    for (const listener of this.listeners) listener();
  }

  private save(): boolean {
    const journal: AgentAudioJournal = { version: 1, selectedDevice: this.state.selectedDevice, active: this.active?.request ?? null,
      pending: this.pending ? { request: this.pending.request, cancelRequested: this.pending.cancelRequested, returningBrowser: this.pending.returningBrowser } : null };
    try { writeAgentAudioJournal(this.storage, this.owner, journal); return true; }
    catch { this.publish({ error: "Your browser could not save the phone connection. Check its privacy settings and try again." }); return false; }
  }

  private current(slot: AudioSlot, lifetime: number) {
    return this.live && this.lifetime === lifetime && (this.active === slot || this.pending === slot);
  }

  private restoreJournal() {
    try {
      const journal = readAgentAudioJournal(this.storage, this.owner);
      this.active = journal.active ? { request: journal.active, connection: null, cancelRequested: false, returningBrowser: false } : null;
      this.pending = journal.pending ? { ...journal.pending, connection: null } : null;
      if (this.active && this.finishedIntents.has(this.active.request.connection_intent_id)) this.active = null;
      if (this.pending && this.finishedIntents.has(this.pending.request.connection_intent_id)) this.pending = null;
      if (this.pending?.returningBrowser && this.active?.request.connection_intent_id === this.pending.request.connection_intent_id) this.active = this.pending;
      this.publish({ error: null, selectedDevice: journal.selectedDevice, preparingBrowser: this.pending?.returningBrowser ?? false });
    } catch { this.publish({ error: "The saved phone connection could not be read. Retry before changing audio." }); }
  }

  mount() {
    this.live = true;
    this.discovering = true;
    const lifetime = ++this.lifetime;
    this.publish({ currentVerified: false });
    this.restoreJournal();
    void this.refresh();
    return () => {
      if (this.lifetime !== lifetime) return;
      this.live = false;
      clearTimeout(this.poll);
      // Established phone audio survives route changes. Remount reads the saved
      // request. Cleanup never sends POST or cancels a newer controller's audio.
    };
  }

  private schedule() {
    clearTimeout(this.poll);
    if (!this.live) return;
    this.poll = setTimeout(() => void this.refresh(), this.pending ? 1500 : this.state.restoring || this.state.recoveryRequired || this.state.customerPending ? 3000 : this.active ? 5000 : 15000);
  }

  private acceptConnection(slot: AudioSlot, connection: VoiceAudioSnapshot): boolean {
    if (slot.connection && !matchesVoiceAudioConnection(slot.connection, connection)) {
      this.publish({ error: "The phone connection changed. Check it again before changing audio." }); return false;
    }
    slot.connection = connection;
    return true;
  }

  private apply(slot: AudioSlot, intent: VoiceAudioIntentSnapshot) {
    if (this.finishedIntents.has(slot.request.connection_intent_id)) return;
    const connection = intent.connection;
    if (slot === this.pending && slot.cancelRequested && intent.intent_state !== "canceled") return;
    if (connection && !this.acceptConnection(slot, connection)) return;
    if (intent.intent_state === "bound" && connection && isVoiceAudioEffective(connection)) {
      this.active = slot;
      if (this.pending === slot) this.pending = null;
      this.publish({ error: null, selectedDevice: agentAudioRequestDevice(slot.request), preparingBrowser: this.pending ? this.state.preparingBrowser : false });
    } else if (intent.intent_state === "superseded") {
      this.finishedIntents.add(slot.request.connection_intent_id);
      if (this.pending === slot) this.pending = null;
      if (this.active === slot) this.active = null;
      this.publish({ error: "The audio connection is now controlled by another request. Select the device again to take control." });
    } else if (!connection || FINISHED_STATES.has(connection.connection_state)) this.finish(slot, intent.intent_state);
    else this.publish({ error: null });
    this.save();
  }

  private finish(slot: AudioSlot, intentState: VoiceAudioIntentSnapshot["intent_state"]) {
    this.finishedIntents.add(slot.request.connection_intent_id);
    if (this.pending === slot) this.pending = null;
    if (this.active === slot) this.active = null;
    const browserReturned = slot.returningBrowser && intentState === "canceled";
    if (browserReturned) this.active = null;
    this.publish({ ...(browserReturned ? { selectedDevice: "computer", preparingBrowser: false } : {}),
      error: intentState === "canceled" ? null : "The phone connection ended. Connect again or select computer audio." });
  }

  private async check(slot: AudioSlot, lifetime: number) {
    const result = slot.cancelRequested ? await cancelVoiceAudioIntent(this.owner, slot.request) : await readVoiceAudioIntent(this.owner, slot.request);
    if (!this.current(slot, lifetime)) return;
    if (result.ok) this.apply(slot, result.intent);
    else this.publish({ error: "The phone connection could not be confirmed. Retry or cancel this request." });
  }

  refresh(): Promise<void> {
    if (!this.live) return Promise.resolve();
    if (this.reading === this.lifetime && this.refreshPromise) return this.refreshPromise;
    const lifetime = this.lifetime;
    this.reading = lifetime;
    this.refreshPromise = this.refreshOwned(lifetime);
    return this.refreshPromise;
  }

  private async refreshOwned(lifetime: number) {
    try {
      const slots = [...new Set([this.active, this.pending])].filter((slot): slot is AudioSlot => slot !== null);
      if (slots.length) await Promise.all(slots.map(slot => this.check(slot, lifetime)));
      if (!this.live || this.lifetime !== lifetime) return;
      const current = await readCurrentVoiceAudio(this.owner);
      if (!this.live || this.lifetime !== lifetime) return;
      if (!current || !this.recoverCurrent(current)) this.publish({ currentVerified: false,
        error: "Your current agent audio could not be confirmed. Check the connection before dialing." });
    } finally {
      if (this.reading === lifetime) { this.reading = null; this.refreshPromise = null; }
      if (this.live && this.lifetime === lifetime) this.schedule();
    }
  }

  private prepareRecovery(intent: VoiceAudioIntentSnapshot): AudioRecovery | null {
    const request = currentVoiceAudioRequest(this.owner, intent);
    if (!request || !intent.connection || this.finishedIntents.has(intent.connection_intent_id)) return null;
    const slot = [this.pending, this.active].find(saved => saved?.request.connection_intent_id === request.connection_intent_id) ?? null;
    if (slot && (!matchesCurrentVoiceAudioRequest(slot.request, intent) || slot.connection && !matchesVoiceAudioConnection(slot.connection, intent.connection))) return null;
    return { slot: slot ?? { request, connection: null, cancelRequested: false, returningBrowser: false }, connection: intent.connection,
      cancelRequested: Boolean(slot?.cancelRequested || intent.intent_state === "canceled" || intent.connection.cancel_requested) };
  }

  private commitRecovery(plan: AudioRecovery): AudioSlot {
    plan.slot.connection = plan.connection;
    plan.slot.cancelRequested = plan.cancelRequested;
    return plan.slot;
  }

  private pendingRecoveryPolicy(current: VoiceAudioCurrentSnapshot): PendingRecoveryPolicy {
    if (!this.pending) return "normal";
    const intentId = this.pending.request.connection_intent_id;
    if (this.pending.cancelRequested && current.active?.connection_intent_id === intentId) return "canceling";
    if (current.pending && current.pending.connection_intent_id !== intentId) return "conflict";
    return "normal";
  }

  private recoveryError(current: VoiceAudioCurrentSnapshot, policy: PendingRecoveryPolicy): string | null {
    if (current.recovery_required) return "Agent audio cleanup is not confirmed. Check the connection before dialing.";
    if (policy === "conflict") return "Another audio request is pending. Check or cancel your saved request before changing audio.";
    if (policy === "canceling" || this.pending && this.pending.request.connection_intent_id !== current.pending?.connection_intent_id)
      return this.state.error ?? "The saved audio request needs confirmation. Check or cancel it before dialing.";
    return null;
  }

  private recoverCurrent(current: VoiceAudioCurrentSnapshot): boolean {
    const policy = this.pendingRecoveryPolicy(current);
    const active = current.active && policy !== "canceling" ? this.prepareRecovery(current.active) : null;
    const pending = current.pending && policy !== "conflict" ? this.prepareRecovery(current.pending) : null;
    if (current.active && policy !== "canceling" && !active || current.pending && policy !== "conflict" && !pending) return false;
    let selectedDevice = this.state.selectedDevice;
    if (active) { this.active = this.commitRecovery(active); selectedDevice = agentAudioRequestDevice(active.slot.request); }
    else if (!current.active && !current.recovery_required) this.active = null;
    if (active && this.pending?.request.connection_intent_id === active.slot.request.connection_intent_id) this.pending = null;
    if (pending) this.pending = this.commitRecovery(pending);
    this.discovering = false;
    this.publish({ currentVerified: true, recoveryRequired: current.recovery_required, customerPending: current.customer_pending,
      predictiveRecovery: current.predictive, manualRecovery: current.manual, dialerRecovery: current.dialer,
      selectedDevice, error: this.recoveryError(current, policy) });
    this.save();
    return true;
  }

  async begin(request: VoiceAudioConnectRequest): Promise<boolean> {
    if (!this.live || !this.state.currentVerified || this.state.restoring || this.state.recoveryRequired || this.pending || this.state.customerPending && !request.callSid) return false;
    const parsed = voiceAudioConnectRequestSchema.safeParse(request);
    if (!parsed.success || parsed.data.workspaceId !== this.owner.workspaceId || this.finishedIntents.has(parsed.data.connection_intent_id)) return false;
    const slot: AudioSlot = { request: Object.freeze(parsed.data), connection: null, cancelRequested: false, returningBrowser: false };
    this.pending = slot;
    if (!this.save()) { this.pending = null; this.publish({}); return false; }
    this.publish({ error: null, preparingBrowser: false });
    return this.submit(slot);
  }

  private async submit(slot: AudioSlot): Promise<boolean> {
    const id = slot.request.connection_intent_id;
    if (this.posting.has(id)) return false;
    this.posting.add(id);
    const lifetime = this.lifetime;
    let result: Awaited<ReturnType<typeof connectVoiceAudio>>;
    try { result = await connectVoiceAudio(this.owner, slot.request); }
    finally { this.posting.delete(id); }
    if (!this.current(slot, lifetime)) return false;
    if (result.ok && !slot.cancelRequested && this.acceptConnection(slot, result.connection) && isVoiceAudioEffective(result.connection)) {
      this.active = slot; this.pending = null;
      this.publish({ selectedDevice: agentAudioRequestDevice(slot.request), preparingBrowser: false, error: null }); this.save();
    } else if (!result.ok) this.publish({ error: result.status === 402 ? "Add credits before connecting your phone." : "The phone connection is not confirmed. Retry or cancel this request." });
    await this.refresh(); this.schedule();
    return result.ok;
  }

  retry = async () => {
    if (!this.live) return;
    if (!this.state.currentVerified || this.state.restoring || this.state.recoveryRequired) { await this.refresh(); return; }
    if (this.pending?.cancelRequested) { await this.cancel(); return; }
    if (this.pending && !this.posting.has(this.pending.request.connection_intent_id)) await this.submit(this.pending);
    else await this.refresh();
  };

  cancel = async (): Promise<boolean> => {
    const slot = this.pending;
    if (!this.live || !slot) return false;
    slot.cancelRequested = true; this.publish({ error: null, preparingBrowser: false }); this.save();
    const lifetime = this.lifetime, result = await cancelVoiceAudioIntent(this.owner, slot.request);
    if (!this.current(slot, lifetime)) return false;
    if (result.ok) this.apply(slot, result.intent);
    else {
      if (result.status === 409) {
        slot.cancelRequested = false;
        if (slot.returningBrowser) { slot.returningBrowser = false; this.pending = null; this.publish({ preparingBrowser: false }); }
        this.save();
      }
      this.publish({ error: "The audio change could not be canceled. Keep the current audio and check the connection." });
    }
    this.schedule(); return result.ok;
  };

  prepareBrowser = (request?: VoiceAudioConnectRequest) => {
    if (!this.live || !this.state.currentVerified || this.state.restoring || this.state.recoveryRequired || this.pending || this.state.customerPending && !request?.callSid) return;
    this.browserRequest = request ? Object.freeze({ ...request }) : null;
    this.browserSource = this.active;
    this.publish({ preparingBrowser: true, error: null });
  };

  /** Called only after the committed SDK registration and input selection succeed. */
  browserReady = async () => {
    if (!this.live || !this.state.preparingBrowser || this.pending) return;
    if (this.active !== this.browserSource) { this.cancelBrowserPreparation(); this.publish({ error: "The audio connection changed. Select computer audio again." }); return; }
    if (this.browserRequest) { await this.begin(this.browserRequest); return; }
    if (!this.active) { this.publish({ selectedDevice: "computer", preparingBrowser: false, error: null }); this.save(); return; }
    this.pending = { ...this.active, cancelRequested: false, returningBrowser: true };
    if (!this.save()) { this.pending = null; this.publish({ preparingBrowser: false }); return; }
    await this.cancel();
  };

  cancelBrowserPreparation = () => { if (this.live && !this.pending) { this.browserRequest = null; this.publish({ preparingBrowser: false }); } };

  managesCustomerAudio = () => Boolean(this.active || this.pending?.request.callSid || this.state.selectedDevice !== "computer");
}
