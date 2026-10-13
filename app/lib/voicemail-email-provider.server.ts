import { Resend } from "resend";

/** Bound the request before the delivery lease can expire. */
export class VoicemailEmailProvider extends Resend {
  override fetchRequest<T>(path: string, options: RequestInit = {}) {
    return super.fetchRequest<T>(path, { ...options, signal: AbortSignal.timeout(10_000) });
  }
}
