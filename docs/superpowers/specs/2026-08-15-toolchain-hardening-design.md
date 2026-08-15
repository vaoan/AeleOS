# Toolchain hardening — what was adopted, what it caught, and what was refused

**Date:** 2026-08-15
**Status:** implemented, except where marked open

This records a run of work that began as "the editor looks chopped on a phone"
and ended with five linters, two migrations, a property-based suite and three
findings that were not style. It is written because most of what happened is
invisible in the diff: the reasoning, the things measured and rejected, and the
two places where a tool's own autofix broke the app.

Read the **Rules** section at the end if you read nothing else. That is the part
meant to stop this recurring.

---

## Why any of this happened

The phone bug was real and small: form controls could not shrink, nested padding
ate 88px of a 360px screen, and three sticky bars were pinned to the same
offset. Fixing it took one PR.

What it exposed was that **AeleOS had no CSS linting at all** — the only one of
the three sibling repositories without it — and that a rule in `globals.css` had
been silently beating every Tailwind utility for months. That single discovery is
the reason for everything that follows: if one whole file type is unchecked,
the question is what else is.

The audit against Puck and Libra found six gaps. All six are closed.

---

## What was adopted, and what each one caught

| Tool                                | Gap it closed                                           | What it found on day one                                                  |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `eslint-plugin-boundaries`          | ~390 lines of repeated `no-restricted-imports`          | The rules were only as real as an import resolver we had never configured |
| `sherif` + `syncpack`               | Three `package.json` files, nothing checking they agree | Nothing — then caught a real mismatch within the hour                     |
| `stylelint`                         | The only repo of three with unlinted CSS                | Its own autofix deleting a `-webkit-` prefix                              |
| `eslint-plugin-better-tailwindcss`  | Class strings unchecked                                 | Nine rules silently disabled; a deprecated class outside the token scale  |
| `eslint-plugin-sonarjs` + `unicorn` | Modern idioms, dead stores                              | An autofix that broke the auth middleware                                 |
| `@axe-core/playwright`              | Rendered-page accessibility                             | Nothing — and disproved an exemption we were about to write               |
| `fast-check`                        | Invariants proved against lists, not properties         | A contrast shortfall no hand-picked colour reached                        |

---

## The three findings that were not style

### 1. An autofix broke the auth gate

`unicorn/prefer-string-raw` rewrote the middleware `matcher` — the regular
expression deciding which requests Clerk sees **at all** — into a `String.raw`
template. Next reads that config statically, so a tagged template is not a value
it can read. The build failed with:

```
⨯ Invalid segment configuration export detected.
  You should see the relevant failures in the logs above.
```

It named no file. There were no logs above. Three attempts to bisect by hand each
blamed a different subtree, because a build cache was replaying the failure; a
binary search over reverts found it in four builds.

**The rule is off.** It is reasonable in general and wrong for anything a build
tool parses rather than executes.

### 2. An autofix shipped a Safari regression

`stylelint --fix`, via `property-no-vendor-prefix`, deleted
`-webkit-backdrop-filter` and left `backdrop-filter` declared twice — three lines
under a comment saying that exact line is load-bearing. The rule assumes
autoprefixer is downstream. Nothing here is, so a prefix in the source is the
only prefix that reaches a browser.

`ignoreProperties` was tried first and does not reach it: the rule reads the
**prefixed** name, so naming the unprefixed one exempts nothing.

### 3. A skin was styling Tailwind's own generated class

`globals.css` styled `[class~="border"]`. It reached the right elements and could
not see what any of them was asking for. Worse, it sat **outside every cascade
layer**, and unlayered CSS beats anything inside a layer regardless of
specificity — so it won against every utility for every property it set,
unconditionally.

```
layers: properties | theme | base | components | utilities
  .backdrop-blur-md   → @layer utilities
  [class~="border"]   → TOP LEVEL (unlayered)
```

One element lost its `backdrop-blur` that way with nothing to report it, and the
card naming its own `shadow-sm` had to be rescued by a hand-written `:not()`.

Layering it was tried and does not work: moved into `@layer components` the blur
behaves, but `.border`'s own `border-width: 1px` then beats the skin's and every
skin's edge weight dies. **The property the rule most needed to override is the
one that defines the class it was selecting** — the tell that it was fighting the
framework rather than using it.

`@utility surface` replaced it across 74 class lists. Both hand-written
exclusions deleted themselves, because a custom utility is sorted among the
others by property count and a single-property utility on the same element wins
by the ordinary rules.

---

## Two migrations: one landed, one refused

### Clerk's `createRouteMatcher` — landed

Deprecated, and Clerk's reasoning is that middleware path-matching can diverge
from how Next routes a request, "leaving protected resources reachable".

**That argument was already answered here**: the `(app)` layout checks the
session itself. The matcher is the outer gate, not the guarantee.

Moving the check into the layout was considered and **rejected on evidence**. The
gate carries the destination into the sign-in URL, and `picker.spec.ts` pins that
contract: an app hands somebody to the picker, they are signed out, and the
destination must survive sign-in or the app that sent them never hears back. A
layout is not told the path it was reached by.

So the matching is ours now — a literal path, optionally `(.*)`, anchored both
ends. That vocabulary is deliberately tiny: this file was already bitten once by
a larger grammar changing underneath it, when `:person(…)` constraints were
removed in path-to-regexp v8 and **silently ignored rather than rejected**.

### next-intl's `setRequestLocale` / `requestLocale` — refused, and this is open

`next/root-params` can only expose a segment belonging to the **root layout**.
Ours is `app/layout.tsx` with `[locale]` nested beneath it, so the import fails
the build with "Export locale doesn't exist in target module". The only way
through is folding the root layout into `[locale]/layout.tsx`.

That was done. It built, and static rendering was unaffected — every app route
was already dynamic because Clerk reads the session, so `setRequestLocale` was
buying nothing. Then the end-to-end suite caught this:

```
✘ the header controls › theme survives a language change
    Locator:  locator('html')
    Expected: "light"
    Received: ""
```

**`data-theme` is wiped on a language change.** The pre-paint script sets it
imperatively; once `<html>` belongs to a layout that re-renders per locale, React
re-renders the element without it. The old structure — root layout _above_ the
locale segment, never re-rendered — was silently protecting that, and the visual
identity notes call the pre-paint attribute load-bearing: "a frame of the wrong
palette… is the whole design changing under the visitor".

**Reverted in full.** The trade is a root-layout restructure plus a new
client-side mechanism guarding a pre-paint invariant, in exchange for removing a
deprecation warning from something that works. A `useLayoutEffect` re-assertion
in `HtmlLang` is the plausible fix and the failing test above is its regression
test. **This is the one open item.** Until it is decided,
`@typescript-eslint/no-deprecated` cannot be enabled, because those six call
sites are all that is left failing it.

---

## What the property tests refused to prove

`palette.test.ts` proves its claims against fifteen hand-picked backgrounds. It
is a good list. What a list cannot do is find the colour nobody thought of.

Three properties were written asserting that derived text clears 4.5:1, and
fast-check refuted all three:

- `#000000` refuted "never worse than the better extreme" — 19.25 against 20.99,
  because the ink carries the design's hue on purpose.
- `#e21233` refuted "clears 4.5 wherever an extreme could": light text on that
  crimson reaches **4.12** where dark text would reach **4.81**.
- `#a53dce` refuted even "clears what its own direction allows".

`palette.ts` says `--ink` takes "whichever extreme contrasts more with the
background, tested rather than assumed". On saturated colours near mid-lightness
the measurements disagree with that sentence by about 0.7 of ratio — the
difference between missing the text minimum and clearing it. **None of the
fifteen named backgrounds is such a colour.**

A fix was drafted and reverted: the walk's chroma decays one per cent per step
and arrives at the extreme still carrying a third of it, so falling back to a
pure extreme looked like the answer. Measured, it moved the worst case from
4.1237 to 4.1252.

**Nothing asserts a claim that could not be proved.** Writing
`expect(ratio).toBeGreaterThanOrEqual(4.1)` would have pinned the shortfall as
though it were the design. The reproduction is recorded in
`palette-properties.test.ts` instead. **This is the second open item.**

---

## The exemption that was not needed

The accessibility suite was written with `color-contrast` **disabled** for a
themed page, on the reasoning that a person's palette is theirs and CI must never
argue for correcting it behind their back.

Measured with the rule **on**, the page passes: `derivePalette` solves text
against whatever background an author picked and clears 4.5:1. The exemption
became an assertion, and a stronger one than any unit test — it reads the
composited result rather than the intended one.

The distinction that survives: the theme is created _by the test_, so a failure
means the **design's** default became unreadable, not that somebody's taste did.
Pointing that suite at a real person's page is a different thing, and
`color-contrast` comes off for it. The app renders an author's colours verbatim
on purpose; what makes that freedom safe is `PageThemeSwitch` offering every
visitor the way out, not a linter refusing to serve the page.

---

## Rules

These are the generalisations worth keeping. Each was paid for.

1. **A newly adopted tool must be shown to fail before it is believed.** Three
   separate tools in this run were silently doing nothing:
   `eslint-plugin-better-tailwindcss` disabled all nine of its rules because
   `tailwindcss` resolved from `apps/hub` and not the root; `eslint-plugin-boundaries`
   could not resolve the imports it was policing; `sherif` and `syncpack` found
   nothing at all. Introduce a violation, watch it fail, restore. A checker
   adopted while it is silent is only worth its runtime if it can be shown to
   speak.

2. **Never run an autofix over code a build tool parses rather than executes.**
   Middleware matchers, route segment configs, `next.config.ts`. Two of the three
   serious findings here were autofixes, and one of them was the auth gate.
   Review the diff of any `--fix` that touches those files, every time.

3. **Do not style a class the framework generated.** It reaches the right
   elements and cannot see what they asked for. Own the class. `stylelint` now
   refuses any `class` attribute selector, so this specific shape cannot return —
   but the general form is "do not reach into another tool's output".

4. **Custom CSS belongs in a cascade layer.** Unlayered rules beat every layered
   one regardless of specificity, which means they beat every utility silently
   and forever. If a rule genuinely must be unlayered, say why in the rule.

5. **When a lint rule disagrees with the code, decide which is wrong — and write
   the answer down.** Several rules here were right in general and wrong for this
   codebase: `prefer-math-trunc` on int32 coercions feeding `Math.imul`,
   `no-null` where a column being unset differs from being empty,
   `prefer-string-raw` on a statically-parsed config. Every disable in
   `eslint.config.mjs` and `stylelint.config.mjs` carries its reason. A silent
   disable is a decision nobody can review.

6. **Two tools fighting is a configuration bug, not a stalemate.** Prettier
   lowercases hex and `number-literal-case` wanted upper; the fix ran, Prettier
   undid it, the next lint reported the same four literals. Name which tool owns
   the question and configure the other to agree.

7. **A property test states a claim; it does not weaken until it passes.** If it
   cannot be proved, record the reproduction and say so. The failing claim is
   worth more than a passing one that was edited to fit.

8. **A migration's cost is not the diff.** Both deprecation migrations here had
   hidden structural requirements — one was fine, one cost the theme. Try it,
   measure the consequence, and be willing to revert with the evidence.

9. **`check:docs` is per symbol and it is not a formality.** A mechanical rename
   across 74 class lists still touched 33 exported symbols, each of which had to
   restate an invariant that still held. That is the tool working: the rename was
   mechanical, the contract was not, and somebody has to look.

---

## Where the enforcement lives

| Rule                                                      | Enforced by                        |
| --------------------------------------------------------- | ---------------------------------- |
| No `class` attribute selectors in CSS                     | `stylelint.config.mjs`             |
| Every file has a declared architectural home              | `boundaries/no-unknown-files`      |
| Layer direction, barrels, feature isolation               | `boundaries/dependencies`          |
| Three `package.json` files agree                          | `sherif`, `syncpack`               |
| Class strings canonical and not deprecated                | `eslint-plugin-better-tailwindcss` |
| Rendered pages meet WCAG A/AA                             | `tests/e2e/a11y.spec.ts`           |
| Phone layouts never scroll sideways, and nothing hides it | `tests/e2e/responsive.spec.ts`     |
| Palette and gradient invariants over all inputs           | `tests/palette-properties.test.ts` |
| TSDoc moves when its implementation does                  | `scripts/check-doc-freshness.mjs`  |
