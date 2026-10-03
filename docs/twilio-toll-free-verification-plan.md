# Toll-free verification for bulk SMS

Toll-free senders need approved verification before bulk SMS. The provider
contract is the [Twilio Toll-free verification resource](https://www.twilio.com/docs/messaging/api/tollfree-verification-resource).

## Current send gate

Workspace Twilio sync reads the complete phone inventory and verification list.
The SDK follows later pages without a total result cap. An exact approved status
permits a toll-free sender. A missing record, unknown status, pending review or
rejection blocks it. Provider and inventory errors remain visible in the sync
snapshot and the send error.

A successful complete sync records `tollFreeVerificationCheckedAt`. A healthy
snapshot must have that proof and an explicit non-blocked result before it can
permit bulk SMS. Missing, malformed, failed and older snapshots remain blocked.
A complete successful inventory with no toll-free sender is a permitted result.
The send gate reads the stored evidence; it adds no provider call per recipient.

## Refresh after rollout

Older healthy snapshots are not proof: the previous list helper discarded
provider errors and permitted missing records. After deploying this fix, use
**Sync Twilio** on the admin workspace list to refresh all workspaces, or
**Sync Twilio now** for one workspace. The workspace Twilio portal also has
**Sync Now**.

Check the resulting health and sync error. An approved toll-free sender or a
confirmed inventory without toll-free senders can send again. A provider error
keeps the gate blocked until credentials/access are repaired and a successful
sync replaces it. This refresh also applies to workspaces without toll-free
senders because older snapshots do not prove complete inventory.

On deployed dev, verify approved, missing, provider-error and later-page cases.
Verify the actual bulk SMS gate and refresh recovery before promotion and issue
closure.

## Verification application data

Provider registration uses business name, website, use case, opt-in workflow,
message samples and contact email. Provider review remains separate from the
source fix. This gate does not submit or approve a verification application.
