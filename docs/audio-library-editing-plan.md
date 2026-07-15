# Audio Library — Editing, Clipping, and On-Screen Recording — Implementation Plan

**Status:** ✅ Streams 1–6 delivered. Record → trim → save works end-to-end, verified in a browser and against the real dev stack. Remaining: apply the migration to deployed databases, and the follow-ups at the bottom.
**Scope:** Edit/trim audio in the workspace library, save reusable cuts ("clips") with lineage, and record audio on-screen — without breaking the filename references that live campaigns depend on.
**Origin:** Closes two pain points already logged in `docs/user-journey-audit.md:180` ("No audio trim or preview editing before save") and `:564` ("No inline actions from the table"). The library empty state at `app/routes/workspaces+/$id/audios.route.tsx:60` has promised "Upload or **record** audio" since before this work.

**Decisions locked:**
- **Metadata sidecar, not an ID migration** — a new `workspace_audio` table annotates bucket objects; `file_name` stays the join key. Every consumer keeps working untouched. *(user decision)*
- **wavesurfer.js v7 + regions plugin** for the waveform/trim UI — client-only, already installed. *(user decision)*
- **"Save as new clip" is the default; overwrite is explicit and warns first** via `findAudioUsage`. Originals are never silently mutated. *(user decision)*
- **Trim renders server-side** through the same ffmpeg path as upload normalization — one output code path, no ffmpeg.wasm in the bundle.
- **Recorder posts a raw take** (webm/opus or mp4) to the existing upload path; ffmpeg normalizes. No client-side transcoding.

---

## The constraint that shapes everything

**The audio library has no database. Filenames are the primary key.**

`app/lib/platform-media.server.ts` lists the workspace prefix from S3 live; "categories" are filename conventions (`recording-`, `voicemail-+` are filtered out). Consumers all store a bare filename:

| Consumer | Column / field |
|---|---|
| Voicemail drop | `campaign.voicedrop_audio` |
| Campaign voicemail | `campaign.voicemail_file` |
| Inbound greeting | `workspace_number.inbound_audio` |
| Queue hold music | `inbound_queue.hold_audio` |
| IVR step | script JSON — see naming hazard below |

Consequences that must not be designed away:
- **Editing in place changes what live callers hear.** Hence save-as-new-clip by default.
- **Renaming breaks references silently.** Rename is deliberately *not* in this plan.
- **A missing sidecar row must degrade to "unknown metadata", never to a broken reference.**

---

## What has landed

| Commit | Contents |
|---|---|
| `4517c48d` | ffmpeg restored to the runtime image; `trimAudioBuffer`; `probeAudioDurationMs`; `workspace_audio` table + migration; `findAudioUsage`; `resolveAvailableBaseName` |
| `bb2aa67c` | `uploadObject` now honours `upsert: false` (was silently ignored) |
| `845549de` | `AudioRecorder.tsx` component |
| `34fa278b` | `AudioClipEditor`, the `$fileName/edit` and `record` routes, sidecar read/write, and the library columns |

**Verification performed**

- Unit: 34 tests across `audio.server`, `audio-usage`, `object-storage-upsert`. Full node suite 1832 passing; UI suite 387 passing.
- Real ffmpeg: a 1000→3000ms cut renders 2038ms.
- Real Postgres 17: migration applies; 9/9 constraint cases behave as designed.
- Real MinIO: repeat conditional PUT refused with 412/PreconditionFailed.
- **Real dev stack (MinIO + Postgres + ffmpeg)**: 5042ms source → clip object genuinely in the bucket at 2038ms, metadata row with correct lineage; a second cut resolves to `-clip-2` rather than clobbering; inverted range refused before any write; overwrite keeps the name and shortens the source in place (5042ms → 1541ms).
- **Real browser** (`e2e/specs/audio-clip-editor.spec.ts`, 5 passing): the library renders Length/Derived from/Size/Edit; the record page mounts and requests a microphone; the clip editor loads the waveform — which is the only real proof the lazy wavesurfer import works, since bundle analysis alone can't show it executing.
- Gates green: `typecheck` (only the 4 pre-existing errors), `lint`, `check:handlers`, `check:type-safety`, `check:dry`, `check:route-server-leaks`, `check:client-bundle`, `build`.

---

## Gotchas discovered — do not re-learn these the hard way

1. **ffprobe cannot read MP3 duration from a pipe.** MP3 carries no duration in its header, so ffprobe must seek and returns `N/A` for any non-seekable stdin. `probeAudioDurationMs` stages to a temp file for this reason. Mocked tests pass either way — this was only caught by running real ffmpeg.
2. **Trim output overshoots by ~40ms.** A 1000→3000ms cut renders ~2038ms: LAME encoder delay + MP3 frame padding (1152 samples ≈ 26ms/frame). Imperceptible for voice prompts, but it **accumulates when re-trimming a clip of a clip**. If that ever matters, trim from the original rather than chaining.
3. **Three names for one concept, and they disagree.** `docs/script-json-format.md` + the vendored editor write `audioFile` gated on `callcasterType === "recorded"`; `getRecordingFileNames()` in `workspace-media.server.ts` reads `say` gated on `speechType === "recorded"`, from a flat array rather than `{pages, blocks}`. `findAudioUsage` matches **both keys across any shape** on purpose: over-warning is cheap, a miss silently breaks a live campaign.
4. **Two lockfiles are load-bearing.** Docker runs `bun install --frozen-lockfile` (bun.lock); CI runs `npm ci` (package-lock.json). Adding a dep requires updating **both** or one of the two pipelines breaks.
5. **`app/AudioStreamer.tsx` is dead code** (zero imports) — a WebSocket streamer, not an uploader. Delete it during Stream 4; do not use it as a reference for save-to-library.
6. **`app/db/schema.ts` is hand-synced.** Never run `drizzle-kit generate` against it — the file's own banner warns it emits destructive DDL. New DDL goes in `client/migrations/*.sql` with a timestamp prefix.
7. **`recording-` is a reserved filename prefix.** `isWorkspaceAudioFile()` filters it out as a Twilio call recording, so a library object named that way uploads successfully and is then invisible. On-screen takes are named `recorded-<stamp>` for exactly this reason. The same trap applies to `voicemail-`.
8. **You cannot seed MinIO with `docker cp`.** Its backend is erasure-coded, so a raw file dropped into `/data/<bucket>/` is not a readable object. Seed through `uploadObject` (which also applies the `workspaceAudio/` key prefix when `S3_BUCKET_AUDIO` is unset and the fallback bucket is used).
9. **Scope table-row selectors in E2E.** An unscoped `getByRole("link", {name: "Edit"})` on `/audios` also matches page chrome and silently navigates to `/billing`. Filter by row.

---

## Stream 1 — Sidecar read/write + lazy backfill

**New:** `app/lib/database/workspace-audio-metadata.server.ts`

```ts
getAudioMetadata(workspaceId, fileName): Promise<WorkspaceAudioRow | null>
listAudioMetadata(workspaceId, fileNames: string[]): Promise<Map<string, WorkspaceAudioRow>>
upsertAudioMetadata(row): Promise<void>   // ON CONFLICT (workspace_id, file_name) DO UPDATE
deleteAudioMetadata(workspaceId, fileName): Promise<void>
```

- **Backfill is lazy, not a migration.** Pre-existing objects have no row. On list, left-join by `file_name`; a missing row renders as "—" duration. Optionally enrich on first edit (download → `probeAudioDurationMs` → upsert). Do **not** attempt to probe every object on every list — that means downloading the whole library per page view.
- Write a row on every create path: upload, recording, clip.
- `origin` is `'upload' | 'recording' | 'clip'`; the DB CHECK enforces that `clip` (and only `clip`) carries `source_file_name` + `clip_start_ms` + `clip_end_ms`.

**Tests:** `test/workspace-audio-metadata.test.ts` — upsert conflict path, missing-row degradation, clip-window constraint rejection surfaced as a clean error.

---

## Stream 2 — Clip render action

**New:** `app/routes/workspaces+/$id/audios/$fileName.clip.action.server.ts`

Flow:
1. `defineAction({ auth: workspaceRouteAuth, sideEffects: ["db-write", "external"] })` — match the surrounding handler style; the repo has a `check:handlers` gate.
2. Authorize: reject `MemberRole.Caller` (mirror `uploadWorkspaceAudioApi`).
3. Parse + validate `startMs`, `endMs`, `name`, `mode: "new" | "overwrite"`.
4. `downloadObject("workspaceAudio", `${workspaceId}/${fileName}`)`.
5. `trimAudioBuffer(buffer, { startMs, endMs })` — server-side guards already reject inverted/negative/<100ms windows.
6. Name resolution:
   - `mode: "new"` → `resolveAvailableBaseName(getSafeMediaBaseName(name), existingBaseNames)`, then `uploadObject(..., { upsert: false })`.
   - `mode: "overwrite"` → require an explicit confirmation flag in the payload; upload with `upsert: true`.
7. `probeAudioDurationMs` on the rendered buffer → `upsertAudioMetadata({ origin: 'clip', source_file_name: fileName, clip_start_ms, clip_end_ms, duration_ms, size_bytes })`.
8. Redirect back to the library with a success banner (`QueryParamBanner` is already wired for `?uploaded=1`).

**Handle `ObjectExistsError`** from the storage layer as a clean 409-style user message via `toUserMessage`, not a 500.

---

## Stream 3 — Waveform clip editor UI

**New:** `app/components/file-assets/AudioClipEditor.tsx`

```ts
type AudioClipEditorProps = {
  src: string;                 // signed URL
  fileName: string;
  initialDurationMs?: number;
  onSave: (range: { startMs: number; endMs: number }, mode: "new" | "overwrite") => void;
  busy?: boolean;
};
```

- wavesurfer v7 + `RegionsPlugin`: one draggable/resizable region = the clip window. Zoom control, play/pause, play-region-only.
- Import wavesurfer **client-side only** — the repo has a `check:client-bundle` gate and route/server-leak checks; wavesurfer touches `window` at import.
- Numeric in/out fields mirroring the region, so a precise cut doesn't require pixel-perfect dragging.
- Enforce `MIN_CLIP_DURATION_MS` (100ms, shared from `audio-upload.ts`) client-side to block a doomed round trip; the server re-validates.
- **Theme the waveform from CSS custom properties**, not hardcoded hex — `DESIGN.md` is tokens-only and dark mode is class-based. Read the computed token values and pass them to wavesurfer's `waveColor`/`progressColor`.

**New route:** `app/routes/workspaces+/$id/audios/$fileName.edit.route.tsx` + `.loader.server.ts`
- Loader: signed URL + sidecar row + `findAudioUsage(workspaceId, fileName)`.
- Default action is **"Save as new clip"**. **"Overwrite original"** is a separate, secondary action that first renders the `findAudioUsage` results ("This file is used by: Spring Drive — voicemail drop; Main IVR — IVR step") and requires confirmation. If usage is empty, say so plainly rather than showing an empty list.

---

## Stream 4 — Wire the recorder

- **New route:** `app/routes/workspaces+/$id/audios/record.route.tsx` — renders `AudioRecorder`.
- Flow: record → `onComplete(blob, mimeType, durationMs)` → POST to the upload action (`origin: 'recording'`) → **redirect into the clip editor** for that new file, so record→trim→save is one continuous path.
- Post the take as `multipart/form-data`; the server accept list already covers `audio/webm` and `audio/mp4`.
- Add an entry point from `audios.route.tsx` alongside "Add audio" — the empty state already advertises recording.
- Consider an in-place record affordance from the script editor: `app/components/campaign/settings/script/CampaignSettings.Script.IVRQuestionBlock.tsx:253` currently *navigates away* to `../../../../audios` to add a clip mid-script-edit.
- **Delete `app/AudioStreamer.tsx`** (dead, zero imports).
- Export `AudioRecorder` from `app/components/file-assets/index.ts` if the barrel is the convention there.

---

## Stream 5 — Library list: duration, lineage, actions

**Edit:** `app/components/file-assets/columns.tsx`
- The `metadata.size` / `metadata.contentLength` columns are commented out because `listObjects` discards S3's `Size` and returns no duration. Now backed by the sidecar — restore them as `duration_ms` (mm:ss) and `size_bytes`.
- Add a **"Derived from"** column for `origin === 'clip'` showing `source_file_name`.
- Add row actions: **Edit** (→ clip editor), **Delete** (must run `findAudioUsage` first and warn; `deleteObject` exists in `object-storage.server.ts` but the media adapter doesn't re-export it — add it there rather than reaching around the adapter).
- Consider surfacing a **"Used by N campaigns"** indicator — `docs/user-journey-audit.md:564` lists its absence as a pain point.

**Also:** `listWorkspaceMediaWithUrls` should left-join the sidecar so the list is one query + one batch signed-URL call, not N probes.

---

## Stream 6 — Verification

Per `verify`: drive the real flow, don't just run tests.

1. Compose stack + E2E server on `:3100` (see `docs/e2e-testing.md`; seeded logins exist).
2. Exercise: **record → trim → save as clip → confirm it appears in the library with a duration and plays**. Then: **trim an existing file → attempt overwrite → confirm the usage warning lists the real campaign**.
3. `e2e/specs/voicemail-setup.spec.ts` and `e2e/fixtures/files/greeting.mp3` already exist — extend rather than duplicate.
4. Gates: `typecheck`, `lint`, `test:node`, `test:ui`, `check:effects`, `check:handlers`, `check:type-safety`, `check:dry`, `check:client-bundle`, `check:route-server-leaks`, `db:ledger:check`.
5. Regenerate `docs/effects-inventory.md` (`ci:local` ends in `git diff --exit-code`, so a stale inventory fails CI). It is currently dirty and holds a concurrent agent's edits — regenerate once the tree settles.
6. Apply `client/migrations/20260715120000_workspace_audio_metadata.sql` to the target database before the UI ships.

---

## Known-red before this work — do not chase these

Confirmed pre-existing on `fix/create-workspace-role-cast`, none caused by the audio work:
- 4 tsc errors: `app/routes/api+/media.action.server.ts`, `app/routes/api+/audiences.loader.server.ts`.
- 14 failing tests in `test/db-workspace.server.test.ts` (invites/sessions; imports `@/db/auth-schema`, unrelated to the audio schema).
- `check:effects` red on `app/components/sms-ui/ChatInput.tsx`, `app/hooks/call/useCallAudioControls.ts`, `app/hooks/call/usePhoneVerification.ts`.

---

## Follow-ups outside this scope

- **`voicedrop_audio` contract contradiction.** `api+/media.action.server.ts` writes a **signed URL** into `campaign.voicedrop_audio`; `api+/audiodrop.action.server.ts` reads the same column as a **bare filename** and signs it again. These cannot both be correct. Same file carries 2 of the 4 pre-existing tsc errors. Worth its own fix.
- **`getRecordingFileNames` may be dead or broken for modern scripts** — it early-returns on a non-array `stepData`, but the documented format is `{pages, blocks}`. Verify which path is live before relying on it.
- **Rename support** is deliberately excluded: with filenames as the primary key it silently breaks every reference. It needs the usage scanner plus a rewrite of all referencing rows — a separate piece of work.
