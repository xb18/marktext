# Parity scoreboard — muyajs → @muyajs/core (PR #4406 follow-ups)

The desktop app migrated from the legacy `packages/muyajs` engine to
`@muyajs/core` (`packages/muya`) in PR #4406. This board tracks the 15 parity
gaps identified after that migration. All 15 now have implementations and
regression coverage; the listed parity tests no longer carry expected-failure
markers. Native clipboard, file-drop and screenshot behavior still needs the
manual checks in [PARITY_QA.md](PARITY_QA.md).

## Regression coverage

Engine parity tests under `packages/muya/src/**/__tests__/` use ordinary Vitest
assertions. Desktop coverage lives in `packages/desktop/test/e2e/parity-*.spec.ts`.
Search for a gap with `rg 'PG14:' packages/muya/src packages/desktop/test`.

The original tests used `it.fails(...)` or Playwright `test.fail()` to record
known gaps. Those markers were removed when the implementations landed. Run the
current suites to assess a particular checkout; this board is not a substitute
for a test result.

## Scoreboard

> **Implementation gaps remaining: 0 / 15.** OS integration checks remain manual.

| Gap      | Severity | Behaviour lost                                                                                            | Test location(s)                                                                                                                                       | Mechanism                                         | Status                                                       |
| -------- | -------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------ |
| **PG1**  | major    | `selection-change` lacks block affiliation / ancestor type → native Paragraph & Format menu state is dead | `packages/muya/src/selection/__tests__/paritySelectionChange.spec.ts` (`PG1:` ×2) · `packages/desktop/test/e2e/parity-pg1-menu-state.spec.ts` (`PG1:`) | passing `it` + passing `test`                     | ✅ fixed (engine #4410 · desktop wave 2)                     |
| **PG2**  | major    | source-mode → WYSIWYG caret not restored (`handleFileChange` drops `muyaIndexCursor`)                     | `packages/muya/src/__tests__/setCursorByOffset.spec.ts` (`PG2:` ×5) · `packages/desktop/test/e2e/parity-source-undo-saved.spec.ts` (`PG2:`)            | passing `it` + passing `test`                     | ✅ fixed (engine `setCursorByOffset` + desktop wave 2)       |
| **PG3**  | major    | `autoCheck` preference not consumed (task-list checkbox cascade lost)                                     | `packages/muya/src/block/gfm/taskListCheckbox/__tests__/parityAutoCheck.spec.ts` (`PG3:` ×2)                                                           | passing `it`                                      | ✅ engine fixed (#4409)                                      |
| **PG4**  | major    | drag-drop image insertion (local file + web link) absent                                                  | `packages/muya/src/editor/__tests__/dragDropImage.spec.ts` (PG4 ×7) · `packages/desktop/test/PARITY_QA.md` § PG4                                       | unit (synthetic `DataTransfer`) + manual-QA       | ✅ engine fixed (#4413)                                      |
| **PG5**  | major    | binary/bitmap clipboard image paste lost (screenshot, browser "Copy Image")                               | `packages/muya/src/clipboard/__tests__/parityImagePaste.spec.ts` (`PG5:`) · `packages/desktop/test/PARITY_QA.md` § PG5                                 | passing `it` + manual-QA                          | ✅ engine fixed #4411 (OS-clipboard manual-QA remains)       |
| **PG6**  | major    | pasted image FILE bypasses `imageAction` (copy-to-assets / upload preference ignored)                     | `packages/muya/src/clipboard/__tests__/parityImagePaste.spec.ts` (`PG6:` ×2)                                                                           | passing `it`                                      | ✅ engine fixed (#4411)                                      |
| **PG7**  | major    | export loads core CSS from CDN instead of inlining it (unstyled offline)                                  | `packages/muya/src/state/__tests__/parityExportHtml.spec.ts` (`PG7:` ×2)                                                                               | passing `it`                                      | ✅ engine fixed (#4412)                                      |
| **PG8**  | major    | exported headings carry no `id` (dead TOC / `[TOC]` anchors)                                              | `packages/muya/src/state/__tests__/parityExportHtml.spec.ts` (`PG8:` ×2)                                                                               | passing `it`                                      | ✅ fixed (engine #4412 · desktop pdf.ts slugger wave 2)      |
| **PG9**  | major    | "Copy as Rich Text" pastes HTML _source_ not rich text (no `copyAsRich` path)                             | `packages/muya/src/clipboard/__tests__/parityCopyAsRich.spec.ts` (`PG9:` ×2)                                                                           | passing `it`                                      | ✅ fixed (engine #4411 · desktop `copyAsRich` map wave 2)    |
| **PG10** | minor    | `preview-image` never emitted — select-image + Space full-screen preview lost                             | `packages/muya/src/selection/__tests__/parityPreviewImage.spec.ts` (`PG10:` ×2)                                                                        | passing `it`                                      | ✅ engine fixed #4414 (desktop subscription already present) |
| **PG11** | minor    | `heading-copy-link` never emitted — hover-to-copy-anchor affordance gone                                  | `packages/muya/src/__tests__/parityHeadingCopyLink.spec.ts` (`PG11:` ×2)                                                                               | passing `it`                                      | ✅ fixed (engine #4414 · desktop subscription wave 2)        |
| **PG12** | minor    | `hideLinkPopup` preference not consumed — link hover popover not gated                                    | `packages/muya/src/editor/__tests__/parityHideLinkPopup.spec.ts` (`PG12:`)                                                                             | passing `it` (+ control)                          | ✅ engine fixed (#4409)                                      |
| **PG13** | minor    | `insertParagraph` anchors to outermost not immediate block in nested structures                           | `packages/muya/src/__tests__/parityInsertParagraphNested.spec.ts` (`PG13:` ×2)                                                                         | passing `it`                                      | ✅ engine fixed (#4408)                                      |
| **PG14** | minor    | first undo after source-mode doesn't revert the edit as one step                                          | `packages/desktop/test/e2e/parity-source-undo-saved.spec.ts` (`PG14:`)                                                                                 | ordinary `test` + engine `replaceContent.spec.ts` | ✅ implemented via `Muya.replaceContent`                     |
| **PG15** | minor    | undo back to on-disk content doesn't restore the saved/clean indicator                                    | `packages/desktop/test/e2e/parity-source-undo-saved.spec.ts` (`PG15:`)                                                                                 | passing `test`                                    | ✅ desktop fixed (wave 2)                                    |

### Severity tally

- **major:** PG1, PG2, PG3, PG4, PG5, PG6, PG7, PG8, PG9 (9) — all fixed
- **minor:** PG10, PG11, PG12, PG13, PG14, PG15 (6) — all fixed

### PG14 — source-mode undo boundary

On source-mode exit, `handleFileChange` calls `Muya.replaceContent` to record the
bulk edit as one undoable whole-document operation. This rebuilds the block tree
instead of applying an arbitrary document diff through the incremental walker.
The desktop spec checks undo, redo and a block-type replacement. Engine coverage
lives in `packages/muya/src/__tests__/replaceContent.spec.ts`.

## Running the suites

```bash
# muya engine parity tests (all pass; PG2 cursor mapping is also covered by
# src/__tests__/setCursorByOffset.spec.ts)
pnpm -C packages/muya test

# a single gap's engine tests
pnpm -C packages/muya exec vitest run src/state/__tests__/parityExportHtml.spec.ts

# desktop parity e2e (build first with `pnpm run build:unpack`)
pnpm -C packages/desktop exec playwright test \
  test/e2e/parity-pg1-menu-state.spec.ts \
  test/e2e/parity-source-undo-saved.spec.ts
```

## Provenance

Gap analysis: the adversarially-verified `d2-parity-review` of PR #4406
(`PG01..PG16` + `PG-COPYRICH`). After de-duplication there are 15 distinct
gaps (the legacy "Space preview" and "insert-paragraph anchor" gaps each
appeared twice; `copyAsRich` is counted as one of the 15). The `PGn` numbering
on this board is the canonical 1–15 list, not the raw review ids.
