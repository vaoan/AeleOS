/**
 * Fixed sample content the Add picker previews with — never written to a
 * page.
 *
 * The picker draws each option with the real renderer, `Block` from
 * `presentation/blocks.tsx`, so a preview cannot disagree with the page: the
 * only thing left to supply is the DATA a sample block carries. That data is
 * fixed, English, and translated with nothing — the visible CAPTION above
 * each preview is translated chrome (`labels.leaf.leafKinds[kind]` /
 * `labels.modes[mode]`), and the sample body exists only to show what the
 * kind or mode looks like, not to be read as somebody's writing.
 *
 * **Most kinds take one generic sample.** `table`, `progress`, `quote` and
 * `stat` invert or structure the title/description pair when they render —
 * see `LEAF_KINDS`' own TSDoc in `block-schema.ts` — and a generic sample
 * would read as wrong on exactly those: a progress bar with no percentage
 * draws no bar, a quote with no attribution shows nothing, and so on. Every
 * other kind renders sensibly off `title_en`/`description_en` alone; some
 * (`link`, `picture`, `embed`, `social`) simply show their plain-card
 * fallback with no address set, which is an honest preview of what an EMPTY
 * one of those looks like the moment it is added.
 */
import {
  CONTAINER_KIND,
  type ContainerBlock,
  type ContainerMode,
  type LeafBlock,
  type LeafKind,
} from "@/features/actors/domain/block-schema";

/** The generic sample title, used by every kind {@link SHAPED_SAMPLES} does not name. */
const SAMPLE_TITLE = "Sample title";

/** The generic sample description, used the same way. */
const SAMPLE_DESCRIPTION = "Sample description text.";

/**
 * The fields a kind needs to render as something other than its own
 * plain-card fallback, keyed by kind.
 *
 * Only the four kinds named in this module's own TSDoc appear here — every
 * other kind is content with the generic title and description above.
 */
const SHAPED_SAMPLES: Partial<Record<LeafKind, Partial<LeafBlock>>> = {
  table: {
    title_en: "Sample table",
    description_en: "A short note under it.",
    rows: [
      [{ text_en: "Row" }, { text_en: "Value" }],
      [{ text_en: "Another row" }, { text_en: "Another value" }],
    ],
  },
  // The title is the LABEL and the description is the VALUE — the inversion
  // `ProgressLeaf` renders. A description `progressValue` cannot read draws
  // no bar at all, so this is a percentage rather than prose.
  progress: {
    title_en: "Sample progress",
    description_en: "60%",
  },
  // The description is what was said and the title is who said it.
  quote: {
    title_en: "Somebody, somewhere",
    description_en: "A short quotation goes here.",
  },
  // The title is the label and the description is the value, exactly as
  // `progress` is.
  stat: {
    title_en: "Sample stat",
    description_en: "42",
  },
};

/**
 * A sample leaf of the given kind, for the Add picker's preview alone.
 *
 * **Never passed to `addContentAt` or any other write.** Choosing an option
 * in the picker adds `newLeaf(kind)`, which starts with an empty title — this
 * function's output is drawn and discarded, and the two must never be
 * confused: an added leaf pre-filled with this sample's words would be a page
 * that arrives looking written when nobody wrote it.
 *
 * @param kind - the leaf kind to preview.
 * @returns a leaf the real renderer can draw, carrying fixed sample fields.
 */
export function sampleLeaf(kind: LeafKind): LeafBlock {
  return {
    kind,
    title_en: SAMPLE_TITLE,
    description_en: SAMPLE_DESCRIPTION,
    ...SHAPED_SAMPLES[kind],
  };
}

/**
 * A sample container in the given mode, for the Add picker's preview alone.
 *
 * Holds two generic sample `text` leaves — a mode with nothing in it shows
 * only its own empty places, which is not a preview of the ARRANGEMENT the
 * option offers. **Never passed to any write**; choosing this option adds
 * `newContainer(mode, spaces)`, whose places start empty. See {@link sampleLeaf}
 * for why this is not the same array of concerns as an added container's own.
 *
 * @param mode - the container mode to preview.
 * @returns a container the real renderer can draw, carrying two sample leaves.
 */
export function sampleContainer(mode: ContainerMode): ContainerBlock {
  return {
    kind: CONTAINER_KIND,
    mode,
    spaces: 2,
    name_en: "",
    children: [sampleLeaf("text"), sampleLeaf("text")],
  };
}
