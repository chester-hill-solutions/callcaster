# CMS and member platform capabilities

Research for issue #2686. Parent map: #2677.

This document records what common CMS and member platforms expose. It feeds three
decisions for the CallCaster public API spec:

1. the contact upsert identity key,
2. the SMS consent contract,
3. whether a generic inbound trigger is needed.

## Scope and method

Read the official developer documentation for each platform on 2026-10-17.
Sources are listed as URLs. This document does not invent API details.

Where a fact is not in the official documentation, the text marks it **unverified**.
Features change. Re-check before you build.

CallCaster does not enable CORS. Browser calls do not work. Every integration must
run on a server or in a no-code tool.

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
- Use `mem_...` as the upsert key. Email is a secondary key.

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
- A phone number and a consent flag are both custom fields. The spec must accept a
  configurable field mapping.

Sources:

- https://docs.memberstack.com/hc/en-us/articles/7389627062299-Understanding-Member-Data-in-Memberstack-Custom-Fields-Metadata-JSON-DataTables
- https://docs.memberstack.com/hc/en-us/articles/7329156946587-Webhook-Events-Reference
- https://developers.memberstack.com/admin-rest-api/quick-start
- https://developers.memberstack.com/admin-rest-api/member-actions

## Webflow CMS

Webflow CMS stores content, not user accounts. A "member list" is a CMS Collection.
Webflow has no member login. Memberstack is a common companion.

### 1. Member/contact record

- A record is a CMS Collection item.
- **Phone is a first-class field type** ("Phone").
- Other field types include plain text, email, number, and option.
- A collection schema allows up to 60 fields.

### 2. Upsert key

- The item `id` is the unique identifier.
- The `slug` is also stable.
- Use the item `id` as the upsert key.

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
- Retries: up to 3 more tries, 10 minutes apart. Webflow then deactivates the
  webhook and sends an email.
- **Important:** webhooks made in the dashboard do not include the signature
  headers. Create the webhook through the API to get signing.

### 4. Consent

- No built-in consent field or consent object.
- Use a CMS field or a form checkbox. The platform makes no messaging-consent
  claim.

### 5. Server-side execution surface

- Webflow Cloud runs framework apps on Cloudflare Workers. Supported frameworks
  include Next.js, Astro, and Vite.
- Static apps are served as assets and do not run a Worker.
- Any external HTTPS host also works as a webhook destination.

### 6. No-code automation

- Webflow is a native Zapier, Make, and n8n app.

### What this means for the CallCaster spec

- A CMS item is a good member record for content-based lists. Phone is first-class.
- The item `id` is a clean upsert key.
- Consent must come from a field the owner adds.

Sources:

- https://developers.webflow.com/data/docs/working-with-webhooks
- https://developers.webflow.com/data/reference/webhooks/events/collection-item-created
- https://developers.webflow.com/data/reference/field-types-item-values
- https://developers.webflow.com/webflow-cloud/environment

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
- Signing: `X-HubSpot-Signature-v3` is an HMAC-SHA256 hash, base64-encoded, of
  `method + uri + body + timestamp`. `X-HubSpot-Request-Timestamp` gives the send
  time. Reject requests older than 5 minutes.
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
- Workflow Custom Code actions run JavaScript or Python. They need Operations Hub
  (Data Hub) Professional or Enterprise.
- Both surfaces can call external APIs. Both support secrets.

### 6. No-code automation

- HubSpot is a native Zapier, Make, and n8n app.

### What this means for the CallCaster spec

- HubSpot is the only platform here with a consent model. Still require an explicit
  consent field, because the API does not expose SMS consent.
- Support `idProperty` aliases (email and custom unique id) for the upsert key.
- Expect an extra read after `contact.creation`.

Sources:

- https://developers.hubspot.com/docs/guides/api/crm/objects/contacts
- https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests
- https://developers.hubspot.com/docs/api-reference/latest/communication-preferences/guide
- https://developers.hubspot.com/docs/cms/start-building/features/serverless-functions/overview
- https://knowledge.hubspot.com/sms/collect-and-manage-consent-to-send-sms-messages

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
- `slug` and `email` are also unique.
- Use the user `id` as the upsert key.

### 3. Webhooks

- **Core has no outbound webhook system.** Actions and filters are PHP-only.
- The REST API is pull-only. You must poll it, or add a plugin or custom code to
  emit events.

### 4. Consent

- None in core.
- Use user meta.

### 5. Server-side execution surface

- The WordPress site is the server. It runs PHP on ordinary hosting.
- The REST API uses Application Passwords for authentication.
- A plugin or theme can call the CallCaster API server-side.

### 6. No-code automation

- Many tools connect to WordPress, including Zapier, Make, and n8n.
- A plugin such as WP Webhooks can emit events.

### What this means for the CallCaster spec

- WordPress can call CallCaster from PHP. It cannot emit webhooks without help.
- Phone and consent are custom user meta.

Sources:

- https://developer.wordpress.org/rest-api/reference/users/
- https://learn.wordpress.org/tutorial/wp-rest-api-custom-fields-authentication-and-testing/

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

- PMP has no first-class configurable outbound webhook in core. This is
  **unverified** for the latest version.
- The documented path is the Zapier add-on. It fires on hooks such as
  `pmpro_after_checkout`.
- PMP action hooks let custom PHP code send data to any URL.
- Inbound gateway webhooks (Stripe, PayPal) exist, but they are not member events.

### 4. Consent

- PMP has a Terms of Service checkbox. It has no SMS consent field.
- Use a custom user field.

### 5. Server-side execution surface

- Same as WordPress. PHP on the site's host.

### 6. No-code automation

- The Zapier add-on is documented.
- Make and n8n can reach WordPress.

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
- Retries: WooCommerce has basic retry behaviour and a "retry delivery" option. It
  disables a webhook after 5 consecutive failures. A failure is any status that is
  not 2xx, 301, or 302.

### 4. Consent

- None. WooCommerce has terms and privacy checkboxes only.

### 5. Server-side execution surface

- Same as WordPress. PHP on the site's host.

### 6. No-code automation

- WooCommerce is a native Zapier, Make, and n8n app.
- WP Webhooks also covers WooCommerce Memberships.

### What this means for the CallCaster spec

- WooCommerce Memberships gives a real membership webhook with an HMAC signature.
- The delete topic name is uncertain. The spec must handle unknown topics safely.

Sources:

- https://godaddy-wordpress.github.io/woocommerce-memberships-rest-api-docs/
- https://developer.woocommerce.com/docs/apis/rest-api/v2/webhooks/
- https://woocommerce.com/document/webhooks/

## No-code automation platforms (HTTP features)

The site owner often bridges a platform to CallCaster with a no-code tool. CallCaster
needs no CORS for this path, because these tools call from a server.

| Tool | Custom headers | Timeout | Retries |
| --- | --- | --- | --- |
| Make | Yes (HTTP "Make a request" module) | 1 to 300 seconds, configurable | No automatic retry in the module. Use error handlers or a schedule. |
| Zapier | Yes ("Webhooks by Zapier" > Custom Request) | 30 seconds per action step (hard) | No automatic retry for webhook actions. |
| n8n | Yes (HTTP Request node) | Configurable, in milliseconds, for the response | "Retry on Fail" with Max Tries and Wait Between Tries. |

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
| HubSpot | First-class `phone` | Record `id`, email, or custom unique id | Yes (v3 signature) | Yes (subscription + legal basis) |
| WordPress core | None (user meta) | User `id` | No | None (user meta) |
| Paid Memberships Pro | Custom User Field | User `id` | No native; Zapier add-on | None (custom field) |
| WooCommerce Memberships | `billing_phone` (WooCommerce) | Membership `id` / `customer_id` | Yes (HMAC-signed) | None |

## Decisions

### 1. Contact upsert identity key

Use a namespaced external id: `{platform}:{record_id}`. Every platform has a stable
record id, so this works everywhere.

- Do not key on phone or email alone. Both can change. Phone is not always unique.
- Keep phone as an attribute, not the key.
- Support aliases where the platform allows them (HubSpot `idProperty` with email or
  a custom unique id; WordPress `email` or `slug`).
- Store the raw platform id so the owner can reconcile records.

### 2. SMS consent contract

Require an explicit consent field on every contact. Most platforms have no consent
model.

Model consent as a small record:

- `status`: `opted_in`, `opted_out`, or `unknown`.
- `source`: where the consent came from.
- `timestamp`: when the contact gave or withdrew consent.
- `legal_basis` text: a free-text explanation.

Rules:

- Never treat a phone number as consent.
- Default to `unknown`. Do not send without `opted_in`.
- Mirror STOP and other opt-out handling back to the platform.
- For HubSpot, map to a consent property or subscription. Document that the
  Communication Preferences API covers email only, not SMS.

### 3. Generic inbound trigger

Yes. One generic inbound trigger is needed.

Reasons:

- Payload shapes and signing differ across platforms.
- WordPress core and Paid Memberships Pro have no native outbound webhook.
- A no-code tool is the common bridge, and it can post one common shape.

Design points:

- One signed HTTPS endpoint. Verify HMAC plus a timestamp. Reject stale requests.
- Make it idempotent. Use the event id where present: Memberstack Svix id, Webflow
  signature plus timestamp, HubSpot `eventId`, WooCommerce webhook delivery id.
- Accept a field mapping: external id, phone, and consent fields. Do not hard-code
  platform field names.
- Handle unknown event topics safely (for example, the WooCommerce Memberships
  delete topic).

## Items marked unverified

- HubSpot exact SMS consent property internal names.
- Paid Memberships Pro: whether the latest version has a native configurable
  outbound webhook.
- WooCommerce Memberships: the exact delete topic name.
- Webflow Cloud resource limits and timeout values (not needed for this decision).
