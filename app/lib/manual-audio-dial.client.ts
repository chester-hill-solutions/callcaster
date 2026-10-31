import { z } from "zod";
import { dialBodySchema } from "@/lib/schemas/api/actions";
import { manualDialFields, sendManualAudioDial, type StartCallArgs } from "@/lib/manual-dial-client";
import type { AgentAudioStorage } from "@/lib/agent-audio-storage.client";

const savedFieldsSchema = z.record(z.string(), z.string()).refine(fields => dialBodySchema.safeParse(fields).success && Boolean(fields.audio_connection_id));
const INITIAL: { pending: boolean; sending: boolean; error: string | null } = { pending: false, sending: false, error: null };

/** Retains a customer send request; the campaign flow still owns its lifecycle. */
export class ManualAudioDial {
  private state = INITIAL;
  private listeners = new Set<() => void>();
  private fields: Readonly<Record<string, string>> | null = null;
  private live = false;
  private lifetime = 0;
  private acceptCustomer: ((sid: string) => boolean) | undefined;
  private storageKey: string;
  constructor(private owner: { workspaceId: string; userId: string; campaignId: number }, private storage: AgentAudioStorage) {
    this.storageKey = `callcaster:manual-audio-dial:1:${owner.workspaceId}:${owner.userId}:${owner.campaignId}`;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(patch: Partial<typeof INITIAL>) {
    if (!this.live) return;
    this.state = { ...this.state, ...patch, pending: this.fields !== null };
    for (const listener of this.listeners) listener();
  }
  mount() {
    this.live = true;
    const lifetime = ++this.lifetime;
    try {
      const saved = JSON.parse(this.storage.getItem(this.storageKey) ?? "null");
      if (saved !== null) {
        const fields = savedFieldsSchema.parse(saved);
        if (fields.workspace_id !== this.owner.workspaceId || fields.user_id !== this.owner.userId || Number(fields.campaign_id) !== this.owner.campaignId) throw new Error("Dial owner changed");
        this.fields = Object.freeze(fields);
      }
      this.publish({ sending: false, error: this.fields ? "A call request needs confirmation. Check the call before you dial another contact." : null });
    } catch { this.publish({ error: "The saved call request could not be read. Reload before dialing." }); }
    return () => { if (lifetime === this.lifetime) this.live = false; };
  }
  begin = async (args: StartCallArgs) => {
    if (!this.live || this.fields || this.state.error || !args.audioSource || !args.acceptCustomer) return;
    const fields = manualDialFields(args);
    if (!fields || !savedFieldsSchema.safeParse(fields).success || fields.workspace_id !== this.owner.workspaceId ||
      fields.user_id !== this.owner.userId || Number(fields.campaign_id) !== this.owner.campaignId) return;
    try { this.storage.setItem(this.storageKey, JSON.stringify(fields)); }
    catch { this.publish({ error: "Your browser could not save the call request. Check its privacy settings before dialing." }); return; }
    this.fields = Object.freeze(fields); this.acceptCustomer = args.acceptCustomer;
    await this.send();
  };
  retry = async (getAcceptor?: () => (sid: string) => boolean) => {
    if (this.state.sending) return;
    if (!this.acceptCustomer && getAcceptor) this.acceptCustomer = getAcceptor();
    await this.send();
  };
  private async send() {
    if (!this.live || !this.fields || !this.acceptCustomer || this.state.sending) return;
    const fields = this.fields, lifetime = this.lifetime;
    this.publish({ sending: true, error: null });
    const sid = await sendManualAudioDial(fields);
    if (!this.live || this.lifetime !== lifetime || this.fields !== fields) return;
    if (!sid || !this.acceptCustomer(sid)) { this.publish({ sending: false, error: "The call request is not confirmed. Check this call before you dial another contact." }); return; }
    try { this.storage.setItem(this.storageKey, "null"); }
    catch { this.publish({ sending: false, error: "The call started, but its saved request could not be cleared. Keep this screen open." }); return; }
    this.fields = null; this.publish({ sending: false, error: null });
  }
}
