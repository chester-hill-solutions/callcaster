import { connectVoiceAudio, isVoiceAudioEffective, matchesVoiceAudioConnection, voiceAudioConnectRequestSchema,
  type VoiceAudioConnectRequest, type VoiceAudioOwner } from "@/lib/voice-audio-client";
import { cancelVoiceAudioIntent, readVoiceAudioIntent } from "@/lib/voice-audio-intent-client";
import type { VoiceAudioIntentSnapshot, VoiceAudioSnapshot } from "@/lib/schemas/api/voice-audio";
import { agentAudioRequestDevice, readAgentAudioJournal, writeAgentAudioJournal,
  type AgentAudioJournal, type AgentAudioStorage } from "@/lib/agent-audio-storage.client";

type AudioSlot = { request: VoiceAudioConnectRequest; connection: VoiceAudioSnapshot | null; cancelRequested: boolean; returningBrowser: boolean };
export type AgentAudioState = {
  restoring: boolean;
  selectedDevice: string;
  active: VoiceAudioSnapshot | null;
  pendingDevice: string | null;
  cancelRequested: boolean;
  preparingBrowser: boolean;
  error: string | null;
};

const INITIAL_STATE: AgentAudioState = { restoring: true, selectedDevice: "computer", active: null,
  pendingDevice: null, cancelRequested: false, preparingBrowser: false, error: null };
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
  private posting = new Set<string>();
  private poll: ReturnType<typeof setTimeout> | undefined;
  private browserRequest: VoiceAudioConnectRequest | null = null;
  readonly owner: Readonly<VoiceAudioOwner>;
  constructor(owner: VoiceAudioOwner, private readonly storage: AgentAudioStorage) { this.owner = Object.freeze({ ...owner }); }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };

  private publish(patch: Partial<AgentAudioState>) {
    if (!this.live) return;
    this.state = { ...this.state, ...patch, active: this.active?.connection ?? null,
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
      if (this.pending?.returningBrowser && this.active?.request.connection_intent_id === this.pending.request.connection_intent_id) this.active = this.pending;
      this.publish({ restoring: Boolean(this.active || this.pending), error: null, selectedDevice: journal.selectedDevice, preparingBrowser: this.pending?.returningBrowser ?? false });
    } catch { this.publish({ error: "The saved phone connection could not be read. Retry before changing audio." }); }
  }

  mount() {
    this.live = true;
    const lifetime = ++this.lifetime;
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
    if (!this.live || (!this.pending && !this.active)) return;
    this.poll = setTimeout(() => void this.refresh(), this.pending ? 1500 : 5000);
  }

  private acceptConnection(slot: AudioSlot, connection: VoiceAudioSnapshot): boolean {
    if (slot.connection && !matchesVoiceAudioConnection(slot.connection, connection)) {
      this.publish({ error: "The phone connection changed. Check it again before changing audio." }); return false;
    }
    slot.connection = connection;
    return true;
  }

  private apply(slot: AudioSlot, intent: VoiceAudioIntentSnapshot) {
    const connection = intent.connection;
    if (slot === this.pending && slot.cancelRequested && intent.intent_state !== "canceled") return;
    if (connection && !this.acceptConnection(slot, connection)) return;
    const restoring = this.state.restoring && this.pending !== null && slot !== this.pending;
    if (intent.intent_state === "bound" && connection && isVoiceAudioEffective(connection)) {
      this.active = slot;
      if (this.pending === slot) this.pending = null;
      this.publish({ restoring, error: null, selectedDevice: agentAudioRequestDevice(slot.request), preparingBrowser: this.pending ? this.state.preparingBrowser : false });
    } else if (intent.intent_state === "superseded") {
      if (this.pending === slot) this.pending = null;
      if (this.active === slot) this.active = null;
      this.publish({ restoring, error: "The audio connection is now controlled by another request. Select the device again to take control." });
    } else if (!connection || FINISHED_STATES.has(connection.connection_state)) this.finish(slot, intent.intent_state, restoring);
    else this.publish({ restoring, error: null });
    this.save();
  }

  private finish(slot: AudioSlot, intentState: VoiceAudioIntentSnapshot["intent_state"], restoring: boolean) {
    if (this.pending === slot) this.pending = null;
    if (this.active === slot) this.active = null;
    const browserReturned = slot.returningBrowser && intentState === "canceled";
    if (browserReturned) this.active = null;
    this.publish({ restoring, ...(browserReturned ? { selectedDevice: "computer", preparingBrowser: false } : {}),
      error: intentState === "canceled" ? null : "The phone connection ended. Connect again or select computer audio." });
  }

  private async check(slot: AudioSlot, lifetime: number) {
    const result = slot.cancelRequested ? await cancelVoiceAudioIntent(this.owner, slot.request) : await readVoiceAudioIntent(this.owner, slot.request);
    if (!this.current(slot, lifetime)) return;
    if (result.ok) this.apply(slot, result.intent);
    else this.publish({ error: "The phone connection could not be confirmed. Retry or cancel this request." });
  }

  async refresh() {
    if (!this.live || this.reading === this.lifetime) return;
    const lifetime = this.lifetime;
    this.reading = lifetime;
    const slots = [...new Set([this.active, this.pending])].filter((slot): slot is AudioSlot => slot !== null);
    try { await Promise.all(slots.map(slot => this.check(slot, lifetime))); }
    finally { if (this.reading === lifetime) this.reading = null; if (this.live && this.lifetime === lifetime) this.schedule(); }
  }

  async begin(request: VoiceAudioConnectRequest): Promise<boolean> {
    if (!this.live || this.state.restoring || this.pending) return false;
    const parsed = voiceAudioConnectRequestSchema.safeParse(request);
    if (!parsed.success || parsed.data.workspaceId !== this.owner.workspaceId) return false;
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
    if (this.state.restoring && !this.active && !this.pending) { this.restoreJournal(); await this.refresh(); return; }
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
    if (!this.live || this.state.restoring || this.pending) return;
    this.browserRequest = request ? Object.freeze({ ...request }) : null;
    this.publish({ preparingBrowser: true, error: null });
  };

  /** Called only after the committed SDK registration and input selection succeed. */
  browserReady = async () => {
    if (!this.live || !this.state.preparingBrowser || this.pending) return;
    if (this.browserRequest) { await this.begin(this.browserRequest); return; }
    if (!this.active) { this.publish({ selectedDevice: "computer", preparingBrowser: false, error: null }); this.save(); return; }
    this.pending = { ...this.active, cancelRequested: false, returningBrowser: true };
    if (!this.save()) { this.pending = null; this.publish({ preparingBrowser: false }); return; }
    await this.cancel();
  };

  cancelBrowserPreparation = () => { if (this.live && !this.pending) { this.browserRequest = null; this.publish({ preparingBrowser: false }); } };

  managesCustomerAudio = () => Boolean(this.active || this.pending?.request.callSid || this.state.selectedDevice !== "computer");
}
