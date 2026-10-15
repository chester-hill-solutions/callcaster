# CallCaster script schema guide

This guide explains the script data used by the editor and by live calls. It
separates the stored CallCaster format from the normalized editor format. They
are related, but they do not use the same field names everywhere.

## The three data layers

### Stored and wire format

Campaign scripts are stored in the script `steps` JSON field. The older
CallCaster shape uses `pages` and `blocks` maps. A page lists its blocks in
`page.blocks`.

### Editor format

The editor uses `ScriptDocument` from
`vendor/scriptkit/scriptkit-call-script-core/src/types.ts`:

```json
{
  "version": 1,
  "startPageId": "page_1",
  "pageOrder": ["page_1"],
  "pages": {
    "page_1": {
      "id": "page_1",
      "title": "Introduction",
      "blockIds": ["block_1"]
    }
  },
  "blocks": {
    "block_1": {
      "id": "block_1",
      "type": "textarea",
      "title": "Greeting",
      "prompt": "Hello"
    }
  }
}
```

The conversion code is in
`vendor/scriptkit/scriptkit-call-script-core/src/migrate/callcaster.ts` and
`app/lib/call-script-service.ts`. Do not change one format without checking
both conversion directions.

### Runtime fields

The runtime also reads fields that the shared editor schema does not fully
model. Unknown fields are preserved in `wireExtras`. IVR uses these fields for
audio, voice, no-input behavior, and provider-specific settings.

## Pages

- `id` identifies the page.
- `title` is the page heading shown in the editor.
- `blocks` is the ordered block list in stored CallCaster data.
- `blockIds` is the ordered block list in the editor document.
- `pageOrder` stores page order in the editor and normalized wire data.
- `startPageId` identifies the first page when it is present.

Linear IVR playback follows block order, then moves to the first block of the
next page. Explicit option routing can override this order.

## Common block fields

- `id`: stable block identity.
- `type`: normalized editor block type.
- `title`: block name shown in the editor and results.
- `content`: original wire content retained through conversion.
- `prompt`: question or prompt text for interactive blocks.
- `options`: response choices for interactive blocks.
- `audioFile`: TTS text or recorded-audio reference for IVR.
- `callcasterType`: original or IVR playback wire type.
- `speechType`: legacy or IVR playback mode.
- `wireExtras`: fields not owned by the shared schema.

`title` is the same field for live blocks and IVR steps. The editor may show
different labels, but it does not store separate `stepName` and `title` fields.

## Live script blocks

The CallCaster palette currently supports these normalized types:

| Type | Use |
| --- | --- |
| `instruction` | Display script text without a response input. |
| `textarea` | Collect free-form text. |
| `select` | Collect one or more listed choices, according to the live UI. |
| `radio` | Collect a single listed choice. |
| `checkbox` | Collect multiple listed choices. |

The canonical internal option fields are `value`, `label`, `content`, and
optional `next`. The migration layer keeps the original wire type and unknown
option keys when it serializes the document.

## IVR blocks

IVR uses the same `ScriptBlock` document model, but the call runtime treats a
block as audio and caller input rather than as an agent-facing form field.

- `callcasterType: "synthetic"` or a compatible type means speak text.
- `callcasterType: "recorded"` means play an audio file.
- `audioFile` contains the speech text or recorded file name.
- `wireExtras.voice` selects the TTS voice.
- `options[].value` contains a DTMF key or `vx-any` for any spoken reply.
- `options[].label` is the answer label shown in results and exports.
- `options[].next` selects the next page, block, or terminal target.

The shared IVR runtime is in `app/lib/ivr-block-runtime.server.ts` and
`app/lib/ivr-gather.server.ts`. The outbound and inbound response routes use
the same navigation model with different call-loading and terminal behavior.

## IVR no-input behavior

IVR option steps can store these values under `wireExtras`:

- `gatherTimeoutSeconds`: wait time for caller input.
- `noInput.action`: continue, hang up, replay, or route to a block.
- `noInput.maxReplays`: replay limit before continuing.

The editor for these fields is
`app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`.

## Navigation

An option `next` value can target:

- `hangup`: end the call.
- `end`: documented terminal alias.
- `pageId:blockId`: a specific block on a page.
- A page id: the first block on that page.
- A block id: a block on the current page.

Routing validation is shared by the editor and launch checks in
`app/lib/ivr-script-validation.ts` and `app/lib/call-script-service.ts`.
Dangling targets and reachable routing cycles are invalid.

## What differs between live and IVR scripts?

The editor shell and document model are shared. The detailed block editor
branches by flow:

- Live scripts use generic prompt, body, option, and response fields.
- IVR scripts use playback mode, TTS voice, audio files, DTMF or speech input,
  no-input behavior, and call routing.

The main entry points are:

- `app/components/campaign/settings/script/ScriptEditorShell.tsx`
- `app/components/campaign/settings/script/ScriptBlockEditor.tsx`
- `app/components/campaign/settings/script/ScriptBlockEditor.IvrStep.tsx`
- `app/components/campaign/settings/script/ScriptBlockEditor.IvrResponses.tsx`

## Safe schema changes

Before changing a script field:

1. Check the normalized type in `vendor/scriptkit/.../src/types.ts`.
2. Check migration in both directions in `migrate/callcaster.ts`.
3. Search the app routes and runtime for the wire field.
4. Preserve unknown fields in `wireExtras`.
5. Add an editor round-trip test and a runtime test when behavior changes.

For upload and stored wire examples, see
[`script-json-format.md`](script-json-format.md). For page and navigation
overview, see [`script-structure.md`](script-structure.md).
