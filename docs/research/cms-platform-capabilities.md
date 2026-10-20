# CMS and member platform capabilities

Research for [#2686](https://github.com/chester-hill-solutions/callcaster/issues/2686).
Parent map: [#2677](https://github.com/chester-hill-solutions/callcaster/issues/2677).

This document records what common CMS and member platforms expose. The final
section records the agreed CallCaster decisions for:

1. the contact upsert identity key,
2. the SMS consent contract,
3. whether a generic inbound trigger is needed.

## Scope and method

Recovered from the research branch at `2cca9b5ab85f159b2da8cea5cbe5daee879561c6`,
first written on 2026-10-17. This revision checks the cited vendor documents on
2026-10-20 and aligns the conclusions with the recorded decisions. Sources are
listed per platform.

Where a fact is not in the official documentation, the text marks it **unverified**.
Features change. Re-check before you build.

Public integrator calls run on a server or in a no-code tool. CallCaster does not
enable cross-origin browser access. Keep workspace API keys on the backend. See
the [CORS policy](../api-overview.md#cors).

## Memberstack

Memberstack is a membership layer for Webflow and other front ends. It is
client-side. It has no hosting.

### 1. Member/contact record

- There is **no first-class phone field**.
- A phone number is a **custom field**. Custom fields are global key-value pairs
  that you define in the dashboard. The docs show a "Phone" custom field.
- Hidden custom fields (`restrictToAdmin`) are backend-only.
- Metadata is backend-write-only and is limited to 500 characters.
- Member JSON holds nested data (1 MB limit). DataTables hold multi-row records.

### 2. Upsert key

- The member `id` (`mem_...`) is stable.
- Email is the auth identifier and is unique.
- The integrator can map `mem_...` to CallCaster's `external_id`. Email is not an
  alternate CallCaster match key; see the agreed identity rule below.

### 3. Webhooks

- Events: `member.created`, `member.updated`, `member.deleted`, `member.plan.added`,
  `member.plan.updated`, `member.plan.canceled`, `team.member.added`,
  `team.member.removed`.
- Delivery is through Svix.
- Payload shape: `{ event, timestamp, payload: { id, auth: { email }, metaData,
  customFields, verified, stripeCustomerId, planConnections } }`. Newer plan events
  use a `data` key instead of `payload`.
- Phone appears only if you define it as a custom field.
- Signing: Svix headers `svix-id`, `svix-timestamp`, `svix-signature`. Verify with
  the raw request body and the endpoint secret (`whsec_...`).
- Retries: exponential backoff over about 24 hours.
- A CSV import fires `member.created` for each imported record.

### 4. Consent

- No built-in consent field.
- Use a custom field, for example `sms_consent`.
- The docs give no SMS consent guidance.

### 5. Server-side execution surface

- None. Memberstack does not host code.
- The site owner needs their own server or an automation tool.
- The Admin REST API base URL is `https://admin.memberstack.com`. Authenticate with
  the `X-API-KEY` header. Full member CRUD is available.

### 6. No-code automation

- Memberstack documents Zapier and Make.com integrations.
- HTTP features depend on the tool. See "No-code automation platforms" below.

### What this means for the CallCaster spec

- Memberstack can send a signed webhook and a stable `mem_...` id. It cannot send
  from the browser. The owner must bridge through a server or an automation tool.
- The integrator maps the phone and consent evidence from its own fields. This
  mapping runs in the integrator's server or automation, not in CallCaster.

Sources:

- https://docs.memberstack.com/hc/en-us/articles/7389627062299-Understanding-Member-Data-in-Memberstack-Custom-Fields-Metadata-JSON-DataTables
- https://docs.memberstack.com/hc/en-us/articles/7329156946587-Webhook-Events-Reference
- https://developers.memberstack.com/admin-rest-api/quick-start
- https://developers.memberstack.com/admin-rest-api/member-actions

## Webflow CMS

This section covers CMS Collection items used as a member list. A CMS item is not
a member authentication record; the integrator must map its member data.

### 1. Member/contact record

- A record is a CMS Collection item.
- **Phone is a first-class field type** ("Phone").
- Other field types include plain text, email, number, and option.

### 2. Upsert key

- The item `id` is the unique identifier.
- A slug can change. Map the item `id` to CallCaster's `external_id`.

### 3. Webhooks

- Events: `collection_item_created`, `collection_item_changed`,
  `collection_item_deleted`, `collection_item_published`,
  `collection_item_unpublished`, `form_submission`, ecommerce, page, and comment
  events.
- Payload shape: `{ triggerType, payload: { id, workspaceId, siteId, collectionId,
  fieldData, cmsLocaleId, createdOn, lastUpdated, isArchived, isDraft } }`.
- `fieldData` holds `name`, `slug`, and the other fields.
- Signing: `x-webflow-signature` is an HMAC-SHA256 hash of
  `timestamp + ":" + body`. The key is the site token secret or the OAuth client
  secret. `x-webflow-timestamp` gives the send time. Reject requests older than
  5 minutes.
- Retries: up to 3 more tries. Webflow can then deactivate the
  webhook and sends an email.
- **Important:** webhooks made in the dashboard do not include the signature
  headers. Create the webhook through the API to get signing.

### 4. Consent

- No built-in consent field or consent object.
- Use a CMS field or a form checkbox. The platform makes no messaging-consent
  claim.

### 5. Server-side execution surface

- Webflow Cloud runs framework apps on Cloudflare Workers.
- Static apps are served as assets and do not run a Worker.
- Any external HTTPS host also works as a webhook destination.

### 6. No-code automation

- n8n has a native Webflow node for CMS item operations. Its HTTP Request node
  can make the CallCaster calls described below.

### What this means for the CallCaster spec

- A CMS item is a good member record for content-based lists. Phone is first-class.
- The item `id` is a clean upsert key.
- Consent must come from a field the owner adds.

Sources:

- https://developers.webflow.com/data/docs/working-with-webhooks
- https://developers.webflow.com/data/reference/webhooks/events/collection-item-created
- https://developers.webflow.com/data/reference/field-types-item-values
- https://developers.webflow.com/webflow-cloud/environment
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.webflow/

## HubSpot

HubSpot is a CRM. It has the richest contact model of the platforms here.

### 1. Member/contact record

- `phone` and `mobilephone` are **first-class default contact properties**.
- Custom contact properties are also available.

### 2. Upsert key

- The Record ID (`id`) is stable.
- Email is a unique identifier.
- A custom unique identifier property is supported.
- The upsert endpoint is `POST /crm/v3/objects/contacts/batch/upsert` with an
  `idProperty`.
- Partial upserts require a custom unique identifier property. Email does not
  support partial upsert.

### 3. Webhooks

- The Webhooks API uses subscriptions, for example `contact.creation`,
  `contact.propertyChange`, and `contact.deletion`.
- `contact.propertyChange` names one property per subscription. `hs_lastmodifieddate`
  cannot be subscribed to. There is no "any change" shortcut.
- Payload shape: a JSON array of events:
  `{ eventId, subscriptionId, portalId, appId, occurredAt, subscriptionType,
  attemptNumber, objectId, changeFlag, changeSource, sourceId }`.
- **`contact.creation` does not include the property values.** Fetch the contact
  after you receive the event.
- Signing depends on the app and signature version. The legacy guide identifies
  CRM webhook subscriptions as v1, with `X-HubSpot-Signature` computed from the
  client secret and body. For v3, validate `X-HubSpot-Signature-v3` and
  `X-HubSpot-Request-Timestamp` as documented. Do not apply the v3 algorithm to a
  v1 delivery.
- Retries: up to 10 tries over 24 hours after a failure, a 4xx or 5xx status, or a
  response slower than 5 seconds.
- A separate "Send a webhook" workflow action has different retry rules (up to
  three days; not on 4xx except 429).

### 4. Consent

- HubSpot has an SMS consent model. The docs say to get **explicit consent** before
  you send SMS.
- Consent is tracked as messaging subscription types plus a legal basis.
- The Communication Preferences API covers the **EMAIL** channel. It does not
  return or set SMS or WhatsApp consent. The exact SMS consent property names are
  **unverified**.
- Common practice is a dedicated consent property. The docs do not define a fixed
  internal name.

### 5. Server-side execution surface

- Serverless functions run Node.js. They serve CMS sites and private apps.
- Use a serverless function or an external backend to call CallCaster. Check the
  selected HubSpot account's serverless entitlement before choosing this path.

### 6. No-code automation

- n8n has a native HubSpot node for contact operations. Its HTTP Request node can
  call CallCaster.

### What this means for the CallCaster spec

- HubSpot is the only platform here with a consent model. Still require an explicit
  consent field, because the API does not expose SMS consent.
- HubSpot's `idProperty` aliases apply to HubSpot's own API. In CallCaster, use
  `external_id` or the agreed normalized-phone fallback.
- Expect an extra read after `contact.creation`.

Sources:

- https://developers.hubspot.com/docs/guides/api/crm/objects/contacts
- https://developers.hubspot.com/docs/api-reference/legacy/webhooks/guide
- https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests
- https://developers.hubspot.com/docs/api-reference/latest/communication-preferences/guide
- https://developers.hubspot.com/docs/cms/start-building/features/serverless-functions/overview
- https://knowledge.hubspot.com/sms/collect-and-manage-consent-to-send-sms-messages
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.hubspot/

## WordPress (core)

WordPress core has users, a REST API, and PHP hooks. It has no outbound webhook
system.

### 1. Member/contact record

- A record is a WordPress user (`wp_users`).
- Core fields: `id`, `name`, `first_name`, `last_name`, `email`, `description`,
  `slug`, `meta`.
- **There is no phone field in core.** A phone number is user meta (a custom
  field) or a plugin field.

### 2. Upsert key

- The user `id` (integer) is stable.
- Map the user `id` to CallCaster's `external_id`. Do not use a mutable slug or
  email as an alternate CallCaster match key.

### 3. Webhooks

- **Core has no outbound webhook system.** Actions and filters are PHP-only.
- Reading users through the REST API needs a poll. A plugin or custom PHP code
  can instead react to an action and call CallCaster. Any poll runs in the
  integrator's infrastructure; CallCaster does not poll WordPress.

### 4. Consent

- None in core.
- Use user meta.

### 5. Server-side execution surface

- The WordPress site is the server. It runs PHP on ordinary hosting.
- The REST API uses Application Passwords for authentication.
- A plugin or theme can call the CallCaster API server-side.

### 6. No-code automation

- n8n has a native WordPress node for user operations. Use its HTTP Request node
  for the CallCaster call. A PHP hook or an integrator-owned schedule supplies
  the trigger.

### What this means for the CallCaster spec

- WordPress can call CallCaster from PHP. It cannot emit webhooks without help.
- Phone and consent are custom user meta.

Sources:

- https://developer.wordpress.org/rest-api/reference/users/
- https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/
- https://learn.wordpress.org/tutorial/wp-rest-api-custom-fields-authentication-and-testing/
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.wordpress/

## Paid Memberships Pro (WordPress plugin)

Paid Memberships Pro (PMP) adds membership levels to WordPress. It uses WordPress
users.

### 1. Member/contact record

- A record is a WordPress user plus a membership level.
- PMP User Fields can add a **Phone field at checkout**. PMP documents this.
- The value is stored as user meta.

### 2. Upsert key

- The WordPress user `id` is stable.
- A membership is keyed by user and level.

### 3. Webhooks

- The documented path is the Zapier add-on. It sends configurable webhooks for
  new orders, updated orders, changed membership levels, and after checkout.
- Its changed-membership payload includes `user_id` and membership fields. The
  cited guide does not specify a signature or retry guarantee; verify these in
  the selected add-on version before use.
- Whether the latest core version has an equivalent native option remains
  **unverified**.
- PMP action hooks let custom PHP code send data to any URL.
- Inbound gateway webhooks (Stripe, PayPal) exist, but they are not member events.

### 4. Consent

- PMP has a Terms of Service checkbox. It has no SMS consent field.
- Use a custom user field.

### 5. Server-side execution surface

- Same as WordPress. PHP on the site's host.

### 6. No-code automation

- The Zapier add-on is documented.
- Other automation can use WordPress HTTP calls; do not assume that a WordPress
  node also covers Paid Memberships Pro's membership changes.

### What this means for the CallCaster spec

- PMP needs custom code or the Zapier add-on to reach CallCaster.
- The spec must not assume a native webhook on WordPress membership sites.

Sources:

- https://www.paidmembershipspro.com/documentation/user-fields/
- https://www.paidmembershipspro.com/how-to-add-a-telephone-number-to-your-pmpro-checkout-page/
- https://www.paidmembershipspro.com/add-ons/pmpro-zapier/

## WooCommerce Memberships (alternative WordPress plugin)

WooCommerce Memberships builds on WooCommerce and the WordPress REST API. It is an
alternative to PMP. It has a clearer webhook story.

### 1. Member/contact record

- A record is a WordPress customer plus a "user membership" object.
- Phone: WooCommerce stores `billing_phone` on the customer and order. It is not a
  membership field.
- A user membership has `profile_fields` and `meta_data`.

### 2. Upsert key

- The user membership `id` (integer) is stable.
- `customer_id` is the WordPress user id.
- WooCommerce core webhook topics `customer.created`, `customer.updated`, and
  `customer.deleted` also exist.

### 3. Webhooks

- Memberships topics: `user_membership.created`, `user_membership.updated`,
  `user_membership.transferred`, and a delete topic. The documentation table
  repeats `user_membership.created` for the delete row. Treat the exact delete
  topic name as **unverified**.
- Membership plan topics: `membership_plan.created`, `membership_plan.updated`,
  `membership_plan.deleted`, `membership_plan.restored`.
- Payload: the user membership object (or plan object).
- Signing: a webhook secret generates an HMAC hash. The hash is in the request
  headers (`X-WC-Webhook-Signature`).
- Delivery: WooCommerce disables a webhook after more than 5 consecutive failures. A
  successful response is 2xx, 301, or 302. The cited page gives no timed retry
  schedule; do not infer one from the disable threshold.

### 4. Consent

- The cited membership schema does not define SMS consent evidence. The
  integrator must retain and map that evidence separately.

### 5. Server-side execution surface

- Same as WordPress. PHP on the site's host.

### 6. No-code automation

- n8n has a native WooCommerce node for customers. Memberships is an extension;
  use the documented membership API or webhook rather than assuming the core
  customer node covers membership events.

### What this means for the CallCaster spec

- WooCommerce Memberships gives a real membership webhook with an HMAC signature.
- The delete topic name is uncertain. The integrator must verify the topic before
  using it; CallCaster does not accept raw WooCommerce webhook events.

Sources:

- https://godaddy-wordpress.github.io/woocommerce-memberships-rest-api-docs/
- https://developer.woocommerce.com/docs/apis/rest-api/v2/webhooks/
- https://woocommerce.com/document/webhooks/
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.woocommerce/

## No-code automation platforms (HTTP features)

The site owner often bridges a platform to CallCaster with a no-code tool. CallCaster
needs no CORS for this path, because these tools call from a server.

| Tool | Custom headers | Timeout | Retries |
| --- | --- | --- | --- |
| Make | Yes (HTTP "Make a request" module) | 1 to 300 seconds, configurable | Configure scenario error handling; the HTTP reference does not promise a retry schedule. |
| Zapier | Yes ("Webhooks by Zapier" > Custom Request) | Developer actions have a 30-second limit; the cited webhook guide does not specify the Custom Request timeout. | Verify the plan's replay behavior; the cited webhook guide gives no retry guarantee. |
| n8n | Yes (HTTP Request node) | Configurable in milliseconds until response headers start | "Retry on Fail" with Max Tries and Wait Between Tries. |

Extra notes:

- Make accepts HTTPS only and rejects self-signed certificates.
- Zapier has a 5 MB maximum payload for actions. Rate limits apply to Webhooks by
  Zapier.
- n8n has no built-in rate-limit awareness in "Retry on Fail". Use Batching with a
  Batch Interval to spread requests.

Sources:

- https://apps.make.com/http
- https://help.zapier.com/hc/en-us/articles/8496326446989-Send-webhooks-in-Zap-workflows
- https://docs.zapier.com/integrations/build/troubleshoot-action-timeouts
- https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/
- https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/common-issues

## Cross-platform summary

| Platform | Phone field | Upsert key | Webhooks | Consent field |
| --- | --- | --- | --- | --- |
| Memberstack | Custom field | `mem_...` id | Yes (Svix-signed) | None (custom field) |
| Webflow CMS | First-class "Phone" field | Item `id` | Yes (HMAC-signed) | None (custom field) |
| HubSpot | First-class `phone` | Record `id`, email, or custom unique id in HubSpot | Yes (verify the delivery's signature version) | SMS subscription UI; cited API is EMAIL-only |
| WordPress core | None (user meta) | User `id` | No | None (user meta) |
| Paid Memberships Pro | Custom User Field | User `id` | Zapier add-on; core option unverified | Custom field |
| WooCommerce Memberships | `billing_phone` (WooCommerce) | Membership `id` / `customer_id` | Yes (HMAC-signed) | No SMS evidence in the cited membership schema |

## Agreed CallCaster decisions

These are the recorded decisions, not new proposals or claims that the API work
has shipped. Platform capabilities above describe the source system. They do not
define new CallCaster match keys, event endpoints, or consent storage.

### 1. Contact upsert identity key

The [#2679 resolution](https://github.com/chester-hill-solutions/callcaster/issues/2679#issuecomment-6235604516)
uses `(workspace, external_id)` when the integrator supplies `external_id`.
Otherwise, match on normalized phone. The fallback also covers contacts created
in the UI or imported by CSV.

- `external_id` wins if the supplied phone belongs to another contact. Keep both
  contacts; dispatch deduplicates by number. Phone stays unconstrained.
- Use a partial unique index on `(workspace, external_id)` for non-null IDs.
  Audit existing duplicate IDs before adding the index.
- Omitted fields stay unchanged. The bulk operation returns a result per row.
- Every researched platform provides an ID the integrator can use. The source
  namespace and the phone-fallback claim rule remain separate follow-ups. This
  research does not select `{platform}:{record_id}` or email/slug aliases.

### 2. SMS consent contract

The [#2681 resolution](https://github.com/chester-hill-solutions/callcaster/issues/2681#issuecomment-6235823013)
requires consent evidence: source, consent time, and jurisdiction. A phone number
or a bare boolean is insufficient. The target contract follows
[ADR-0034](../adr/0034-recipient-messaging-consent-and-fail-closed-disclosure.md).

- The agreed interim release uses `contact.opt_out` until the consent ledger
  lands. Evidence details are dropped; the CMS must retain the proof.
- Dropped evidence cannot be backfilled. Integrators must supply it again after
  the ledger lands. The carrier proof gap remains open in the interim.
- Skip ineligible recipients per row with a reason. Reject an audience with no
  eligible recipients at preflight.
- An integrator can push an opt-out. It cannot restore eligibility; only the
  recipient's START can do that. The opt-out webhook is a separate follow-up.
- HubSpot's SMS consent UI is not the EMAIL-only Communication Preferences API.
  Verify the source evidence fields rather than treating email consent as SMS consent.

### 3. Generic inbound trigger

The [#2683 resolution](https://github.com/chester-hill-solutions/callcaster/issues/2683#issuecomment-6235905906)
is push-only, with no generic event endpoint. The integrator calls the specific
operations: upsert contacts, create a broadcast, or reply.

- CallCaster does not store third-party credentials, fetch CMS records, or own
  per-platform connectors.
- A server or automation owned by the integrator receives and verifies vendor
  webhooks, fetches missing fields if needed, maps the data, and calls CallCaster.
- WordPress PHP hooks, the Paid Memberships Pro add-on, or an integrator-owned
  scheduled job can make outbound calls. Missing native webhooks do not require
  a generic endpoint in CallCaster.
- This direction of trust does not remove CallCaster's outbound workspace
  webhooks. Membership reconciliation remains a separate lifecycle decision.

## Items marked unverified

- HubSpot exact SMS consent property internal names.
- Paid Memberships Pro: whether the latest version has a native configurable
  outbound webhook.
- WooCommerce Memberships: the exact delete topic name.
- Webflow Cloud resource limits and timeout values (not needed for this decision).
