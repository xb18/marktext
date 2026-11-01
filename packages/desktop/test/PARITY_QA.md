# Parity manual-QA checklist (muyajs → @muyajs/core)

Some parity gaps from the desktop migration to `@muyajs/core` (PR #4406) cannot
be exercised reliably in a headless / xvfb CI run — they need a real OS
clipboard with bitmap data, a real drag-and-drop gesture, or the native
screenshot tool. They are tracked here as precise manual checklists instead of
automated tests.

Run these on a packaged or `pnpm run dev` build. Each entry maps to a row in
[`PARITY_SCOREBOARD.md`](./PARITY_SCOREBOARD.md). The engine and desktop wiring are implemented. Perform these steps on the target
platform to verify native integration; this checklist does not record a fresh
manual test result.

> These are regression checks for implemented behavior. Record the application
> commit, platform and result when running them.

---

## PG4 — Drag-and-drop image insertion (local file + web link)

**What is now automated:** the engine drag-drop handler is restored and unit
tested in `packages/muya/src/editor/__tests__/dragDropImage.spec.ts` (PG4).
happy-dom provides a fully working `DataTransfer` (`items.add` / `getAsString` /
`files`) and fires `getAsString` synchronously, so a synthetic `drop` event
drives the real handler end-to-end. The spec asserts both drop paths against the
live handler: a dropped local image FILE inserts a `![loading-id](path)`
placeholder and invokes the `imageAction` hook with `{ src, alt, title }`; a
dropped web-link image (`text/uri-list`) inserts `![](url)`; and a drop outside
an editor content block is a no-op.

**Why this part stays manual:** the unit test mocks the embedder hooks
(`getPathForFile` / `imageAction`). It cannot exercise a genuine OS-level file
drop from the file manager, Electron's real `webUtils.getPathForFile`, or the
desktop assets-folder / upload persistence behind `imageAction`. Verify those by
hand:

### Steps — local image file

1. Open a document (ideally a saved `.md` so assets-folder behaviour applies).
2. From the OS file manager, drag a `.png` / `.jpg` file over the editor body
   and drop it inside a paragraph.

**Expected:** a loading placeholder appears, then an inline image
renders. With `Preferences → Image → insert action = "copy to folder"` the file
is copied into the document's assets folder and the link points there (not the
original absolute path).

### Steps — web-link image

1. In a browser, drag an image (or its URL) over the editor and drop it.

**Expected:** `![](<url>)` is inserted and the image renders.

### Desktop integration

`editor.vue` passes `muyaImageAction` as `imageAction` and
`window.electron.webUtils.getPathForFile` as `getPathForFile` in the Muya
constructor options. Verify the actual copy/upload result, since engine tests
mock these host hooks.

---

## PG5 — Binary/bitmap clipboard image paste (screenshot, browser "Copy Image")

**Why manual:** this needs a real bitmap on the OS clipboard (no file path). The
engine-unit half — that a synthetic `clipboardData.files` PNG is read into a
base64 `data:` URL and persisted via `imageAction` — is now **implemented and
passing** in
`packages/muya/src/clipboard/__tests__/parityImagePaste.spec.ts` (PG5). The full OS-clipboard + macOS `screencapture`
integration can only be verified by hand and stays manual.

### Steps — browser "Copy Image"

1. In a browser, right-click an image → **Copy Image** (puts a bitmap, not a
   file path, on the clipboard).
2. Focus the editor and paste (Cmd/Ctrl+V).

**Expected:** the bitmap is inserted as an inline image and
persisted per the insert-action preference.

### Steps — macOS screenshot integration

1. On macOS, trigger the in-app screenshot action and select a region.
2. The main process saves the capture to a file and emits `mt::screenshot-captured`
   with its path; the renderer calls `editor.pasteImage(filePath)`.

**Expected:** the screenshot is inserted as an inline image.

The screenshot path is separate from native clipboard paste; check both.

---

## Coverage boundaries

- PG4 and PG5 both now have engine-unit regression tests that drive the real
  handler with a synthetic `DataTransfer`
  (`packages/muya/src/editor/__tests__/dragDropImage.spec.ts` for PG4,
  `packages/muya/src/clipboard/__tests__/parityImagePaste.spec.ts` for PG5).
  These manual entries cover only the OS-integration / desktop-wiring parts the
  unit tests cannot reach (real OS file drop, `webUtils.getPathForFile`, the
  assets-folder/upload persistence behind `imageAction`, the OS clipboard, and
  the macOS screenshot-file integration).
- PG5 also verifies the separate screenshot-file delivery that the synthetic
  clipboard test cannot reach.
