# Builder workbench final-review fix report

Date: 2026-08-23  
Branch: `cursor/builder-workbench-implementation`

## Result

All Important findings and every listed low-cost minor were addressed in one
fix wave. Public `themeCss`/`ThemeScope`, the real `Block`/`PublicBlocks`
renderers, drag semantics, and AeleOS workbench controls remain intact.
`apps/hub/.gitignore` was neither touched nor staged.

## Production changes

- `complete-page-preview.tsx`
  - Lenient-parses each top-level in-progress block and keeps valid neighbours
    when one draft block is malformed.
  - Adds stable region/toggle test IDs and omits `aria-controls` while content
    is unmounted.
  - Replaces concealed overflow with reachable horizontal scrolling and
    documents the inline preview's bounded fidelity.
- `fursona-editor.tsx`
  - Removes `sections` from the editor-wide watch.
  - Adds a small complete-preview controller whose local subscription updates
    the full preview without rerendering toolbar/identity/theme chrome.
- `section-preview-tray.tsx`
  - Gives each tray an accessible label containing its section name.
  - Restores the third-party-frame privacy decision and explicitly accepts the
    temporary second mount while complete preview is open.
- `actor-theme.ts` and `preview-theme-host.tsx`
  - Name both raw stylesheet sinks in the safety contract.
  - Document why preview CSS is unlayered and why all hosts intentionally share
    one selector.
- `block-card.tsx` / `block-editor.tsx`
  - Move `previewTitle` to the label owner that actually renders the preview.

## Test-premise corrections

- `section-style-popup.spec.ts` now establishes its baseline on the exact
  preview and face elements later assertions read. The excluded wrong behaviour
  is a preview that already carried the asserted skin/picture before the popup
  changed it.
- `border-style-cascade.spec.ts` now says the dashed empty place proves sibling
  preview isolation. It no longer claims to discriminate Tailwind utility
  ordering; the public inheritance case uses a deliberately plain surface.
- `section-card-face.spec.ts` repurposes the cutout case as a scope-boundary
  check: the real preview has a polygon clip while the AeleOS card computes
  `clip-path: none`. The hostile-picture case now names what it proves: AeleOS
  chrome contrast beside a full-strength tray picture, not controls painted
  over that picture.
- `a11y.spec.ts`, `responsive.spec.ts`, and `section-card-face.spec.ts` use the
  new stable complete-preview IDs. Accessibility scans both collapsed and open
  disclosure states; narrow coverage opens the preview at all six phone stops.
- `personalised-page-cost.spec.ts` now describes preview-scoped invalidation,
  current container/leaf vocabulary, and the existing measured workbench
  numbers rather than stale root-scoped/flat-arrangement claims.
- `.secretlintignore` explains why generated `.next` and `coverage` outputs are
  excluded.

## TDD and sabotage evidence

- Malformed complete-preview guard: first failed on the missing IDs; after the
  IDs exposed the path, replacing the lenient filter with direct blocks made
  the named test fail with 3 rendered sections instead of 2. Restored green.
- Editor invalidation guard: the new toolbar render counter failed 3 vs 2 with
  the old parent sections subscription. Reintroducing that subscription after
  the fix reproduced the same red result. Restored green.
- Tray association guard: initially received no accessible name; adding the
  section-qualified region label made it green.
- Hostile CSS guard: bypassing `bodyBackgroundVars` in `previewThemeCss` made all
  three hostile URLs reach `background-image` and fail. Restored green.
- Narrow-preview guard: changing `overflow-x-auto` back to `overflow-hidden`
  failed at portrait 320 with expected `auto`, received `hidden`. Restored
  green.

## Timeout measurements

- The block-cap unit case completed as part of a 16-test file in 1.41s, so its
  unexplained 20s per-test relaxation was removed.
- The expanded credentialed accessibility case measured 14.2s locally. Its
  120s case bound remains because the default 30s previously timed out in CI
  inside a later axe `analyze()` after earlier route scans, then passed on
  retry. The source comment now records both measurements and the reason; this
  is not presented as a performance improvement.

## Verification

- Focused unit: 206 tests passed across actor theme, preview host, complete
  preview, editor, block editor, and style popup suites.
- Focused credentialed browser: 38 tests passed across accessibility, section
  style, border cascade, card face, and all responsive viewports in 2.2m.
- Responsive sabotage restore: portrait 320 passed in 5.2s.
- Full local proportional gate, one chained run, exit 0:
  - `pnpm format:check`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test:hub:coverage`
  - `pnpm check:docs`
  - `pnpm check:tools`
  - `pnpm check:contrast`
  - `pnpm secretlint`
  - `pnpm --filter hub build`

The credentialed dev server continues to log the existing server-render
`getToken()` warning; browser assertions and all selected tests pass.

## Justified deferral

Unique selectors per preview host remain deferred. The enforced invariant is
one editor, one live page theme: every section tray and the complete preview
must show that same theme. Supporting two different draft themes side by side
would change the product state and requires per-host selectors; no current
caller can express it, so expanding the selector scheme now would be a
hypothetical feature rather than a review fix.
