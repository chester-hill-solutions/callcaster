# Sai QA issues — 2026-07-28

**Author:** sai-sy  
**Parent:** [#1103](https://github.com/chester-hill-solutions/callcaster/issues/1103) Onboarding Change Requests  
**Working branch:** `dev`  
**Walkthrough date:** 2026-07-28  
**Status:** Implementation in progress (product issues); #1116 deferred to devops track

---

## Goal

Ship Sai’s 2026-07-28 onboarding pass plus the SMS content save bug, then clear Jul-22 leftovers still assigned. Environments (#1116) is a separate devops track.

---

## Issue ledger

| Issue | Title | Status |
|------:|-------|--------|
| [#1115](https://github.com/chester-hill-solutions/callcaster/issues/1115) | SMS Content got cleared after save | **Done** — coalesce nested `body_text` + message save UX |
| [#1107](https://github.com/chester-hill-solutions/callcaster/issues/1107) | Goal tooltip advances to audience | **Done** — InfoPopover `type="button"` |
| [#1104](https://github.com/chester-hill-solutions/callcaster/issues/1104) | First step = goal (+ rent-a-number path) | **Done** — goal-first + `rent_number` |
| [#1105](https://github.com/chester-hill-solutions/callcaster/issues/1105) | Identity bare bones (name + URL) | **Done** |
| [#1106](https://github.com/chester-hill-solutions/callcaster/issues/1106) / [#1076](https://github.com/chester-hill-solutions/callcaster/issues/1076) | Program details strip / axe | **Done** — SMS-only, two fields |
| [#1108](https://github.com/chester-hill-solutions/callcaster/issues/1108) | BN guidance for toll-free campaigns | **Done** — campaign create + TFV helper |
| [#1109](https://github.com/chester-hill-solutions/callcaster/issues/1109) | Audience continue / manage confusing | **Done** — call-list copy + Continue styling |
| [#1110](https://github.com/chester-hill-solutions/callcaster/issues/1110) | Rent a number issues (parent) | Parent of #1111–1114 |
| [#1111](https://github.com/chester-hill-solutions/callcaster/issues/1111) | Double H1 on number step | **Done** — demoted address heading |
| [#1112](https://github.com/chester-hill-solutions/callcaster/issues/1112) | Address form width + edit mode | **Done** |
| [#1113](https://github.com/chester-hill-solutions/callcaster/issues/1113) | No space between action titles | **Done** — stacked fieldsets + gap |
| [#1114](https://github.com/chester-hill-solutions/callcaster/issues/1114) | Number step too much at once | **Done** — progressive disclosure |
| [#1097](https://github.com/chester-hill-solutions/callcaster/issues/1097) | Credits warning on credits page | **Done** — hide banner on `/billing` |
| [#1095](https://github.com/chester-hill-solutions/callcaster/issues/1095) | Credits upload message too big | **Done** — compact credits step |
| [#1094](https://github.com/chester-hill-solutions/callcaster/issues/1094) | Too much vertical padding | **Done** — upload dropzone |
| [#1093](https://github.com/chester-hill-solutions/callcaster/issues/1093) | Upload audiences: 2 back buttons | **Done** — removed parent Back |
| [#1077](https://github.com/chester-hill-solutions/callcaster/issues/1077) | Better upload UI component | Deferred |
| [#1116](https://github.com/chester-hill-solutions/callcaster/issues/1116) | Environments (dev/qa/pre-prod/prod) | **Separate devops track** |

---

## Implementation notes

### #1115

`updateCampaign` / `buildUnifiedCampaignFields` prefer non-empty nested `campaignDetails.body_text` / `message_media` over empty top-level placeholders. Message campaigns save directly (no script copy modal) and flatten details into the PATCH payload.

### #1107

`InfoPopover` uses `TooltipTrigger asChild` + `<button type="button">` so it cannot submit the goal form.

### #1104–1106

`wizardStepsForGoal`: `path_selection` → `business_identity` → (`business_program` only for `sms_blast`) → checklist. New goal `rent_number` skips audience/script/campaign. Identity UI is name + website + country; program UI is use-case + samples only.

### #1097

Workspace low-credit banner is suppressed on `/billing`.
