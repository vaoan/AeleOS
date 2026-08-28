import { Layers, Square } from "lucide-react";
import type { ReactNode } from "react";

import { tid } from "@/shared/infrastructure/test-id";

/**
 * The two things a card in the page builder can be.
 *
 * A container at depth 0 is a section and a container below one is a nested
 * section, and both answer `"container"` here on purpose: a nested section IS
 * a section, so a third name would be something to learn for a difference
 * {@link ContainerRail} already draws.
 */
export type CardKindName = "container" | "content";

/** The mark each kind wears, owned here so no call site picks a glyph. */
const MARKS = {
  container: Layers,
  content: Square,
} as const satisfies Record<CardKindName, unknown>;

/**
 * The colour each kind's word is set in, paired with the colour of its bar.
 *
 * **The two eyebrows were byte-identical before this**, both `--muted`, so the
 * only thing separating them at a glance was a 14px glyph — and the glyphs are
 * a stack of sheets against a filled tile, which is a distinction you have to
 * look at rather than one you notice. Setting each word in its own bar's
 * colour means the word and the bar say the same thing twice, so either one
 * answers "which of these am I looking at" on its own.
 *
 * **The pairing is the point, not the accent.** Whoever changes a bar's colour
 * changes the word's here in the same edit, or the card starts telling a reader
 * two different things about itself.
 */
const TONES = {
  container: "text-(--accent)",
  content: "text-(--muted)",
} as const satisfies Record<CardKindName, string>;

/**
 * What {@link CardKind} draws.
 */
export interface CardKindProps {
  /** Which of the two things this card is. */
  kind: CardKindName;
  /** The already-translated noun, shown beside the mark. */
  children: ReactNode;
}

/**
 * The mark and the word naming what a card in the builder IS.
 *
 * **It exists because nothing else in the editor said.** A section card and a
 * content card paint the same background — `--surface` is `var(--surface-solid)`
 * in the single `:root, .aeleos-chrome` block and dark mode redeclares only the
 * raw pair — so the whole distinction was one border-alpha step, four pixels of
 * radius and two of padding. A reader had no word to go on either: both cards'
 * nouns sat in field labels set in the same size and weight as every other
 * label in the row.
 *
 * The container's mark is the one its CREATING control carries, so an action
 * keeps its sign through the flow: `Layers` is on the "add a section here"
 * button, and a section wears it afterwards. Content answers with a single
 * tile against that stack. The caller names the kind rather than handing in a
 * glyph, so adding a third kind is an edit here and nowhere else.
 *
 * The mark is hidden from assistive technology because the word beside it says
 * the same thing.
 *
 * **Each kind's word is set in its own bar's colour** — see {@link TONES}. Both
 * were `--muted` until 2026-08-28, byte-identical, so the glyph was the only
 * thing separating them and a reader had to compare two 14px marks to answer
 * which card they were looking at. The word and the bar now say it twice, so
 * either answers alone. The tone comes from the same `kind` the glyph does, so
 * a third kind is still an edit in this file and nowhere else.
 *
 * **It belongs on the LABEL's line, never in the row holding the control.**
 * Measured at 320px in Spanish: put beside the leaf's kind select it pushed a
 * 204px `select` — as wide as `Reproductor de música`, and with no `w-full`
 * fallback to wrap onto a line of its own the way the section's selects have —
 * 71px past the viewport. Above the control it competes with a two-word field
 * label instead, so it costs no width in the tight row and no height at all.
 *
 * @returns the eyebrow, marked `card-kind` for selection.
 */
export function CardKind({ kind, children }: CardKindProps): ReactNode {
  const Mark = MARKS[kind];
  return (
    <span
      {...tid("card-kind")}
      data-card-kind={kind}
      className={`flex shrink-0 items-center gap-1 text-[0.625rem] font-semibold tracking-wider uppercase ${TONES[kind]}`}
    >
      {/* **Filled for content, outline for a container.** An outlined square
          beside a word is an unchecked checkbox to anybody who has used a
          form — it invites a click that does nothing. A solid tile against a
          stack of sheets is the same opposition without the false affordance. */}
      <Mark
        className={`size-3.5 ${kind === "content" ? "fill-current" : ""}`}
        aria-hidden
      />
      {children}
    </span>
  );
}

/**
 * The rail down a container's inside edge.
 *
 * **It is drawn once per container at every depth, which is the whole point.**
 * A section holds places and a leaf fills one; that containment was legible
 * only from position, and a nested section was styled byte-for-byte like a
 * top-level one — `idsFor` changed the test ids and nothing else. Rails nest
 * physically, so depth becomes countable rather than inferred: three stacked
 * rails is a block at the cap.
 *
 * **Where it sits was measured twice, against two different faults.** At
 * `left-0.5` it sat 1px from the card's own border and read as part of it —
 * photographed, and invisible. Widening the card to `pl-4` to give it a gutter
 * fixed that and cost 8px of the card's MIN-CONTENT width, 4px per nesting
 * level, which pushed the editor sideways at 568px and is what
 * `responsive.spec.ts` caught. It sits at `left-1` inside the uniform `p-3`
 * now: 4–7px, so 3px clear of the border and 1px clear of the header's `-m-1`
 * bleed at 8px, and the card is exactly as wide as it was before any of this.
 *
 * **Its test id says `container`, not `section`.** The end-to-end suite counts
 * sections through `section-card`, which `idsFor` emits at depth 0 only; a rail
 * marked "section" at every depth would make that vocabulary mean two things —
 * the same ambiguity `idsFor`'s own two sets exist to avoid.
 *
 * @returns the rail, decorative and hidden from assistive technology.
 */
export function ContainerRail(): ReactNode {
  return (
    <span
      {...tid("container-rail")}
      aria-hidden
      className="pointer-events-none absolute inset-y-2 left-1 w-[3px] rounded-full bg-(--accent)/60"
    />
  );
}
