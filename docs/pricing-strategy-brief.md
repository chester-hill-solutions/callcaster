# CallCaster Pricing Strategy Brief

**Prepared:** May 2026  
**Purpose:** Partner review — proposed credit pricing grounded in Twilio costs and competitor benchmarks  
**Status:** Implemented — Option B rate card landed June 2026. See [billing-source-of-truth.md](./billing-source-of-truth.md).

---

## Executive summary

CallCaster should move from today’s **$0.003/credit** model to **$0.02/credit**, with usage rates that cover Twilio’s real costs while staying competitive with campaign tools like Scale to Win, CallHub, and CallFire.

**Recommended voice model:** **$0.04 per dial + $0.06 per additional minute** (2 credits + 3 credits per extra minute at the new peg). This matches industry leaders on short robodial calls, bundles AMD (answering machine detection) into the dial charge, and avoids the platform fees and agent seat fees competitors charge.

**Key headline for customers:** *No monthly fees. No agent seats. Pay only for what you use.*

---

## The problem today

We have three different pricing stories:

| Surface | What it says |
|---------|--------------|
| Public pricing page | $0.03/text, $0.06/dial + $0.06/min, $1.20/staffed call |
| Billing page in app | Various credit rules that don’t match code |
| **What we actually charge** | **1 credit ($0.003) per SMS or call-minute; $3/mo per number** |

The actual billing rates are **roughly 7–10× below Twilio’s all-in cost** on SMS and voice. We are subsidizing every campaign. Number rental (~$3/mo) is the only line that is clearly profitable.

---

## What Twilio costs us (Canada / US, approximate)

Twilio bills in USD; we sell credits in CAD. Planning assumption: **1 USD ≈ 1.37 CAD**.

| Component | Twilio cost (≈ CAD) |
|-----------|--------------------:|
| Local phone number | $1.58 / month |
| SMS segment (long code + typical carrier fees) | $0.015 – $0.019 |
| Voice outbound (US/Canada) | $0.019 / minute |
| Answering machine detection (AMD) | $0.010 / answered call |
| Call recording (IVR) | $0.003 / minute |

**Costs we incur but don’t currently bill for:**

- **AMD** on every outbound auto-dial and IVR call
- **Call recording** on IVR flows
- **Two phone legs** on staffed live calls (contact + agent in browser)
- **Extra SMS segments** on long messages (we store segment count but always debit 1 credit)

---

## What competitors charge (USD, May 2026)

### Texting (per outbound segment)

| Vendor | Rate | Fixed fees |
|--------|-----:|------------|
| Switchboard | $0.015 | None |
| Scale to Win | $0.015 | None |
| CallHub | $0.019 | None |
| Hustle | $0.040 | $250 platform fee |
| CallFire (pay-as-you-go) | $0.060 | None |

### Voice / robodial

| Vendor | Model | Rate |
|--------|-------|-----:|
| Scale to Win | Per dial | **$0.040 / dial** (no per-minute for connected time) |
| CallHub | Per dial | **$0.045 / dial** |
| CallFire (pay-as-you-go) | Per minute | $0.060 / minute |
| CallFire (Grow plan) | Per minute | ~$0.030 / minute ($299/mo for 10k units) |

### Staffed / live calling

| Vendor | Model | Rate |
|--------|-------|-----:|
| CallHub | Per agent connection + destination | ~$0.069 / 60 seconds (browser) + destination |
| CallTools | Per agent seat | $100 – $120 / agent / month |

### Phone numbers

| Vendor | Rate |
|--------|-----:|
| CallHub | $2.00 / month |
| CallFire (pay-as-you-go) | $10.00 / month |
| **Proposed CallCaster** | **$2.00 CAD / month** |

### Platform fees

| Vendor | Monthly minimum |
|--------|----------------:|
| CallFire Lite | $99 |
| Hustle PAYGO | $250 platform fee |
| CallTools | $100 – $120 / agent |
| CallHub Scale | $2,500 minimum contract |
| **CallCaster** | **$0** |

**Our structural advantage:** Pure prepaid credits, no subscriptions, no agent seats, credits don’t expire in monthly buckets.

---

## Proposed pricing

### Credit peg

**1 credit = $0.02 CAD**

| Setting | Today | Proposed |
|---------|------:|---------:|
| Credit price | $0.003 | **$0.02** |
| Minimum purchase | $0.50 | **$10.00** (500 credits) |
| Purchase tiers | $5 – $200 | **$10 / $25 / $50 / $100 / $250 / $500** |

Simple mental model: **1 credit ≈ 1 text segment.**

### Recommended rate card (Option B)

AMD and IVR recording are **included in the dial charge** — not shown as a separate line item to customers.

| Product | Credits | Customer pays (CAD) |
|---------|--------:|--------------------:|
| SMS / segment | 1 | **$0.02** |
| MMS | 2 | **$0.04** |
| IVR / auto-dial — first minute (includes AMD) | 2 | **$0.04 / dial** |
| IVR / auto-dial — each additional minute | 3 | **$0.06 / min** |
| Staffed live — first minute (2 legs + AMD) | 4 | **$0.08 / dial** |
| Staffed live — each additional minute | 5 | **$0.10 / min** |
| Rented phone number | 100 / month | **$2.00 / month** |

**Example IVR costs (Option B):**

| Call | Credits | Cost |
|------|--------:|-----:|
| 20-second voicemail | 2 | $0.04 |
| 1 minute | 2 | $0.04 |
| 2 minutes | 5 | $0.10 |
| 5 minutes | 14 | $0.28 |

This matches **Scale to Win** on per-dial ($0.04) and **CallFire** on additional minutes ($0.06/min).

### Alternative (Option A) — not recommended for growth

Flat **5 credits per started minute** ($0.10/min) for all IVR/dialing. Simpler to explain, but **2.5× more expensive than Scale to Win** on short calls (e.g. a 20-second voicemail costs $0.10 instead of $0.04).

---

## Example campaign: side-by-side

**Scenario:** 10,000 SMS + 2,000 IVR calls (avg 2 min) + 500 staffed calls (avg 3 min) + 2 phone numbers

| | What we charge today | Proposed (Option B) |
|--|--------------------:|--------------------:|
| SMS | $30 | $200 |
| IVR | $6 | $200 |
| Staffed calling | $1.50 | $140 |
| Phone numbers | $6 | $4 |
| **Total** | **~$44** | **~$544** |

**Same campaign at competitors (approximate USD):**

| Vendor | Estimated cost |
|--------|---------------:|
| Scale to Win | ~$230 |
| CallHub Essentials | ~$280+ |
| CallCaster (Option B) | ~$397 USD equivalent |
| CallFire pay-as-you-go | ~$1,320 |

We sit between the political specialists and CallFire — with **no platform fee** and **no agent seats**.

---

## Where we win vs. lose

| | Verdict |
|--|---------|
| SMS at $0.02 CAD | **Win** — matches Switchboard / Scale to Win |
| Numbers at $2/mo | **Win** — matches CallHub, beats CallFire |
| No monthly / seat fees | **Win** — beats Hustle, CallFire plans, CallTools |
| IVR with Option B | **Win** — matches Scale to Win / CallHub on short calls |
| Staffed calling | **Win** for small teams vs. seat-based dialers |
| IVR with Option A (flat $0.10/min) | **Lose** on short robodial vs. Scale to Win |

---

## Marketing message (draft)

> **Simple, prepaid pricing. No monthly fees. No agent seats.**
>
> - **$0.02** per text (per segment)
> - **$0.04** per dial + **$0.06** per additional minute (IVR & auto-dial)
> - **$0.08** per dial + **$0.10** per additional minute (live staffed calls)
> - **$2.00** / month per phone number
>
> Credits never expire. Buy what you need, when you need it.

---

## Open decisions

1. **Confirm Option B** (per-dial + per-minute) vs. Option A (flat per-minute) for voice
2. **Grandfathering** — do existing customers keep old rates for a transition period?
3. **Volume discounts** — e.g. 5% bonus credits at $100+, 10% at $500+ (no change to published rate card)
4. **Minimum balance** before starting large campaigns — suggest 250 credits ($5)

---

## Recommended next steps

1. **Align** public pricing page, in-app billing copy, and campaign cost estimates with the chosen rate card
2. **Update billing code** to debit the new credit amounts (SMS segments, tiered voice, staffed detection)
3. **Change credit purchase price** from $0.003 to $0.02 in Stripe checkout
4. **Validate** against 30–90 days of admin Twilio usage data per workspace before going live
5. **Launch** with “no monthly fees” positioning vs. CallFire / Hustle / CallTools

---

## Appendix: glossary

**AMD (Answering Machine Detection)** — Twilio feature that detects whether a call was answered by a person, voicemail, or fax. Costs ~$0.0075 USD per answered call. We use it on all outbound dials. Included in our per-dial price, not billed separately.

**Started minute** — Billing rounds up to the next full minute (e.g. a 90-second call = 2 minutes for per-minute charges after the first dial charge).

**Segment** — SMS billing unit. Messages over 160 characters (or with emoji) split into multiple segments; each segment is billed separately.

---

*Questions or feedback? Happy to walk through the numbers on a call.*
