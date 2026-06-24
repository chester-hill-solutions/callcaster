# Admin API (sudo)

JSON routes mirroring `/admin` UI. Requires `access_level === 'sudo'` on the user record.

Auth: bearer JWT or session cookie via `requireSudo` — returns JSON 403, never redirects.

## Dashboard

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/dashboard` | Workspaces, users, campaigns summary |
| POST | `/api/admin/dashboard` | Actions: toggle workspace/user, sync Twilio |

## Users

| Method | Path | Purpose |
| --- | --- | --- |
| GET/PATCH | `/api/admin/users/:userId` | User detail / edit profile & access level |
| GET/POST | `/api/admin/users/:userId/workspaces` | Membership list; add/update/remove/cancel invite |

## Workspace Twilio admin

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/admin/workspaces/:workspaceId/twilio` | Twilio portal actions (sync, bootstrap, A2P, RCS, billing reconcile, etc.) |

POST body includes `"action"` matching admin UI action names from `admin+/workspaces/$workspaceId/twilio.actions.server.ts`.

## See also

- [Complete surface inventory](./api-surface-inventory.md)
