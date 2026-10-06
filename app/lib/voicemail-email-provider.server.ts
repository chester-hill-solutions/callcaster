import { Resend, type Response as ResendResponse } from "resend";

/** Bound the request before the delivery lease can expire. */
export class VoicemailEmailProvider extends Resend {
  override fetchRequest<T>(path: string, options: RequestInit = {}): Promise<ResendResponse<T>> {
    return super.fetchRequest<T>(path, { ...options, signal: AbortSignal.timeout(10_000) });
  }
}
