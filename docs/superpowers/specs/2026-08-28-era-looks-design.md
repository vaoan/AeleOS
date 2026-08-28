# Era looks — the site wearing somebody else's operating system

> **Status: designed, not built (2026-08-28).** Nothing in here has shipped.
> Whoever builds a phase updates this banner in the same change; a banner is
> only a banner while somebody maintains it.

## What this is for

The eleven pastiches under `/137/` asked whether the block model could be
pushed toward eleven eras of somebody else's social network. This asks the
same question of five eras of somebody else's **operating system** — Windows
98, XP, Vista, 7 and 8 — and for the same reason: a pastiche fails visibly and
in a way you can name, where "the editor feels limited" is not actionable.

It also does a second thing the social pastiches did not: it makes each look
something **an author can choose**, rather than a page only we can seed.

## What already exists, measured rather than recalled

**Two existing skins already cover three of the five eras**, under different
names, and this was checked against the table in `shared/domain/skins.ts`
rather than assumed:

- **`retro` IS Windows 98.** `--skin-round: 0`, a 2px border,
  `inset 1px 1px 0 rgb(255 255 255 / 0.55)`,
  `inset -1px -1px 0 rgb(0 0 0 / 0.35)` and a hard `2px 2px 0` drop shadow —
  the raised-bevel chrome of Win95/98 exactly.
- **`aero` IS Vista and Windows 7.** `blur(8px)` backdrop, `--skin-blur: 16px`,
  a top-half white sheen gradient, and a surface mixed to 72% — Aero glass. The
  two releases are near-identical to each other, so two of the five land on one
  existing skin.

**So three of the five requested looks already have their chrome**, and adding
skins for them again
would be the "another set of numbers" this repo's own bar forbids — the test
that removed `columns` before anything could store one.

**But picking the skin does not give you the look**, and that is the finding
that shapes everything below. `retro` gets you Win98's bevel and none of its
grey, its title bars, or its type. An OS look is chrome **plus** palette
**plus** heading treatment **plus** radius **plus** spacing.

## The ruling: an era look is a DOCUMENT, not a skin

A look that spans five vocabularies is not a member of any one of them. It is a
**page document** — the `{ aeleos, theme, blocks }` envelope
`page-document.ts` already owns.

This is not a new idea being introduced here. The page-source design already
ruled that **a template and somebody's real page are the same artefact**, and
that identity is excluded from the envelope precisely so an imported page
renders with the importer's own portrait and name. Era looks are the first
thing that actually needs that ruling to be true.

Three things follow, and each is a saving rather than a cost:

- **No new vocabulary member** for a look that composes from existing ones.
- **No new import path.** A look is applied by the code that already applies a
  pasted document, which is already guarded, already tested, and already
  described in the generated reference.
- **The reference documents them for free**, which is the "AI assistants can
  help users build their page" requirement — a model reading the reference sees
  the same envelope an era look ships in.

## A template IS a document, which finishes a decision already made

Era looks must be **pickable**, not merely pasteable. Today they cannot be, and
the reason is precise:

`FursonaTemplate` is `{ id, sections: FursonaSection[] }` — flat sections, in
the pre-block vocabulary, converted by `sectionsToBlocks` when the picker
applies one. **A template cannot carry a theme at all.** An era look is mostly
theme.

So `FursonaTemplate` becomes a document: `{ id, document }`, where `document`
is the same envelope the source dock parses. The picker applies it through
`parseDocument` — one path, not two.

Two consequences that must not be skipped:

- **Applying a template now replaces the author's COLOURS as well as their
  page**, where today it replaces only sections. The confirmation has to say
  so. `holdsNothingAuthored` decides whether to ask at all, and it currently
  asks about blocks alone; it must consider the theme too, or an author who
  chose colours and nothing else gets no warning before losing them.
- **An absent theme must keep meaning "leave the current theme alone."**
  `parseDocument` already distinguishes an omitted `theme` from a malformed
  one, and a template that ships structure without a palette must ride that
  same rule rather than resetting anybody to defaults.

## The five, and what each actually needs

| era           | builds on | new mechanism needed                                        |
| ------------- | --------- | ----------------------------------------------------------- |
| Windows 98    | `retro`   | none predicted                                              |
| Windows XP    | none yet  | a title bar that is a gradient over a **top-rounded** panel |
| Windows Vista | `aero`    | none predicted                                              |
| Windows 7     | `aero`    | none predicted                                              |
| Windows 8     | none yet  | **per-block colour — which is refused by design**           |

**Windows 8 is predicted to FAIL, and that prediction is on the record before
anything is built.** Metro's whole signature is flat solid colour blocks in
_different_ colours. Per-block colour is refused deliberately — a skin names no
colour of its own, and every pairing of a style and a palette is somebody's
page — and it is already gap 6 in the pastiche findings. If Win8 cannot be
built faithfully, that is the finding, and the answer is a ruling about
per-block colour rather than a quiet exception.

**Windows XP is the opposite**, and mostly already reachable: `heading:
"gradient"` exists and is exactly Luna's title bar. What is missing is
rounding the panel's **top corners only**, which no current key expresses.

Predictions are predictions. Whatever the build actually finds replaces this
table, and the table is not evidence.

## Evidence discipline

Reference images are fetched and **looked at**, not recalled. The loop is
proven: Wikipedia's `imageinfo` API resolves a `File:` title to a URL, `curl`
saves it, and it is read as an image. Verified end to end on
`File:Windows XP Luna.png` before this spec was written.

**Where a fetch fails, the page is built from knowledge and SAID SO** — in the
seeder, in the findings and in the README, exactly as the existing eight
captures and three knowledge-built pages already are. Eight and three are not
the same evidence and a reader cannot tell them apart by looking.

**Arrangement and palette, never a logo or a brand asset.** This matters more
here than for the social pages: these are trademarked visual designs, and what
is being imitated is an era's aesthetic. No Microsoft artwork is fetched,
embedded or committed.

## Documentation obligations

- **Every new option gets a meaning in `page-reference.ts`.**
  `page-reference.test.ts` already fails the build when a vocabulary member has
  none, so this is enforced rather than promised. Anything new added here is
  gated the same way in the same change.
- **`features/actors/CLAUDE.md` records each look as an OPTION and never a
  default.** Absence keeps meaning exactly what it meant before the option
  existed, and no stored page changes appearance.
- **The pastiche findings gain each new gap**, in the same change that finds
  it.

## Testing

- Each seeded page is written through `set_actor_sections`, so a fixture the
  database refuses fails loudly rather than rendering half a page. The existing
  seeder already does this.
- **A new option is asserted on the COMPUTED property in a browser, not on a
  class string.** Root rule 36: a Tailwind class that compiles to nothing is
  indistinguishable, in every unit test this repo has, from one that works.
- **Every page is photographed and the frame read back** — the whole frame,
  not the claim being argued for.
- The template change needs a case proving an applied template's theme lands,
  and one proving a template WITHOUT a theme leaves the author's alone. The
  second is the one that would otherwise ship untested, because every fixture
  tends to carry a theme.

## What must not be undone

- **Colour stays page-level** unless a deliberate ruling reverses it. Win8 is
  the pressure on that, and pressure is not a reason.
- **A look is never a default.** Every one of these is opt-in, and a page that
  chose none is byte-for-byte what it was.
- **Three of the five are existing skins.** Whoever revisits this should not
  add `win98` or `win7` to `SKINS`; they are `retro` and `aero` wearing a
  document.

## Phases

1. **The method and the template seam** — `FursonaTemplate` becomes a document,
   the picker applies one through `parseDocument`, the confirmation tells the
   truth about colours.
2. **The five era documents**, seeded under `/137/` and shipped as templates.
3. **The fidelity pass on the eleven social pages**, last on purpose: building
   the era looks first surfaces the walls, and the eleven are better rebuilt
   once knowing them than twice.
