---
name: stripe-docs
description: >-
  Use when the user or agent needs to read, search, or look up Stripe
  documentation or API reference. Prefer this over curl or WebFetch for any
  docs.stripe.com content. Use to fetch gated documentation.
metadata:
  short-description: Read and search Stripe documentation from the terminal
allowed-tools:
  - Bash(stripe docs *)
  - Bash(stripe login)
  - Bash(stripe version)

---

Use `stripe docs` instead of fetching [docs.stripe.com](https://docs.stripe.com/.md) content directly with `curl` or `WebFetch`. If you don’t have the CLI installed, [install the Stripe CLI](https://docs.stripe.com/cli/install).

Always use the latest CLI version. If the current CLI version is less than v1.50.9, you must [upgrade](https://docs.stripe.com/cli/install) to access gated documentation.

- Fetches Markdown automatically
- Fetches gated documentation. Users must log in using `stripe login` to access gated documentation.
- Purpose-built for agents and terminal workflows

## Preserve local credentials and verify identity

Even `stripe version` can try to update permissions on the default config. If
that config is not writable, use a task-owned `--config` file for public docs;
do not change the user's existing authentication file.

`stripe whoami` reports CLI profile metadata. With a command-scoped API-key
override, verify the actual request account with `GET /v1/account`. Keep keys
out of command arguments, output and saved artifacts.

Sandbox management needs an authorized live-account CLI profile. An access
failure does not prove that no sandboxes exist. Ask for the intended account
and the required login before creating or changing its sandbox setup.

## Read a page by its web path

```bash
stripe docs /payments
```

## Search documentation by keyword

```bash
stripe docs search "payment intents"
```

## Look up API reference

```bash
# By resource name
stripe docs api product

# By HTTP method and path
stripe docs api GET /v1/products

# By event type
stripe docs api product.created
```
