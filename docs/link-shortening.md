# Twilio Link Shortening (click tracking + segment savings)

**Status: code shipped, inert until a short domain is verified in the Twilio Console.**

The outbound SMS param builder already passes `shortenUrls: true` whenever a
message body contains a URL (`app/lib/twilio-outbound-sms.server.ts`). Twilio
ignores the flag until the Messaging Service has a verified link-shortening
domain, so today it is a harmless no-op.

## Why this matters (unit economics)

- A raw tracking URL (80–100 chars) routinely pushes a message from 1 SMS
  segment to 2. A shortened link (~22 chars) keeps it at 1.
- Both sides of the ledger halve for those messages: the platform's Twilio
  cost (~$0.008–0.013/segment with 10DLC carrier fees) and the customer's
  credit spend (1 credit/segment).
- Click events become available per message (future work: surface click
  counts in campaign analytics).

## One-time ops steps (Twilio Console — no API exists for domain verification)

1. Buy/choose a short domain (e.g. `cclk.to`). It must be dedicated to link
   shortening — Twilio serves the redirects.
2. Twilio Console → **Messaging → Link Shortening**: add the domain, follow
   the DNS verification steps (CNAME records at your DNS provider), wait for
   verified status.
3. Associate the verified domain with each Messaging Service used for
   campaign/chat sends (Console → the Messaging Service → Link Shortening).
   Workspace messaging services are provisioned by
   `app/lib/twilio-bootstrap.server.ts` — new workspaces will need the
   association too until Twilio exposes an API for it (re-check
   https://www.twilio.com/docs/messaging/features/link-shortening
   periodically).
4. Verify end-to-end: send a chat message containing a full URL from a
   workspace whose Messaging Service has the domain attached; the delivered
   text should show the short domain, and the click should redirect.

## Caveats

- Shortening applies only to sends that go through a Messaging Service
  (campaign + chat sends resolve one via `app/lib/sms-send-resolve.ts`;
  bare-`from` sends are not shortened).
- Only `http(s)` URLs in the body are shortened; Twilio rewrites them at
  send time — the stored message body keeps the original URL.
