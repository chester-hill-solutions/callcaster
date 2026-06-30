# CallCaster

Version 1

## Documentation

- **[Docs index](docs/README.md)** - Central index for active docs and archived root notes.
- **[Archive index](archive/README.md)** - Location and purpose of deprecated/legacy files moved out of root.
- **[Local development](docs/local-development.md)** - Run the app locally, including Postgres, Localtunnel, and Twilio calling setup.
- **[Script structure](docs/script-structure.md)** – How campaign scripts are stored (`steps`), pages vs blocks, and IVR navigation.
- **[Script JSON format](docs/script-json-format.md)** – Script structure for campaigns (pages, blocks); field reference and examples.
- **[API overview](docs/api-overview.md)** – Public integrator API boundary, auth, and endpoint list.
- **[Complete API surface](docs/api-surface-inventory.md)** – Generated inventory of all callable `/api` routes; Scalar at [`/docs?spec=complete`](/docs?spec=complete).
- **[Create campaign with script (one-shot API)](docs/api-create-campaign-with-script.md)** – `POST /api/campaigns/create-with-script`: create a campaign with script, caller ID, and audiences in a single request (session or API key).
- **[Send SMS](docs/api-send-sms.md)** – `POST /api/chat_sms` and `POST /api/sms` public messaging endpoints.
- **[Public API test drift](docs/public-api-test-drift.md)** – Tracked gaps and verification commands for the integrator API surface.
- **Interactive API docs** – Public spec at **[`/docs`](/docs)**; complete classified surface at **[`/docs?spec=complete`](/docs?spec=complete)**. Raw JSON: `/api/docs/openapi`, `/api/docs/openapi/all`.
- **[Stripe webhook](docs/stripe-webhook.md)** – Configure Stripe to send `checkout.session.completed` to `/api/stripe-webhook`; requires `STRIPE_WEBHOOK_SECRET`.
