/**
 * The kinds made of an author's own WORDS, and the three that shape them.
 *
 * `text` is a heading and a paragraph; `quote`, `stat`, `progress` and `table`
 * are the same material given a form — an attribution, a measured value, a bar,
 * a grid. What groups them is that every one of them renders characters
 * somebody typed, so none reaches a network, an allowlist or a provider.
 *
 * That is the whole reason the split falls here rather than by card shape:
 * `media-leaves.tsx` holds the kinds that resolve somebody ELSE'S address and
 * carry the provider rules that go with it, and `link-leaves.tsx` holds the two
 * that point somewhere without embedding it. A change to the embed allowlist
 * cannot reach this file.
 *
 * Registered in `blocks.tsx` like every other kind; the contract is
 * `block-contract.ts`.
 */

import { Quote as QuoteMark } from "lucide-react";
import type { ReactNode } from "react";
import { contentFor } from "@/features/actors/domain/actor-content";
import type { LeafBlock } from "@/features/actors/domain/block-schema";
import { progressValue } from "@/features/actors/domain/progress-value";
import {
  CORNER_CLASS,
  type LeafProps,
  wordsOf,
} from "@/features/actors/presentation/block-contract";
import { PublicSectionIcon } from "@/features/actors/presentation/public-section-icon";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * A leaf's own words, on a plain surface.
 *
 * **This is the `text` kind AND the fallback every other kind lands on**, which
 * is one function rather than two on purpose: "a heading with optional prose"
 * is exactly what a leaf that cannot render its content has left to show, so a
 * separate fallback would be a second body of the same thing, free to drift.
 * A leaf with words never renders as nothing — "refuses nothing, shows nothing"
 * is the trap the media layouts already avoid, and a block that vanished would
 * leave a hole in a grid its author placed it in.
 *
 * **A leaf with NO words renders nothing at all, and that is the same rule
 * rather than an exception to it.** It is reachable only inside `tabs` or
 * `accordion`, where the mode has lifted the title and the author left the
 * description empty — `title_en` is `min(1)` in the schema, so at
 * `labelled: true` there is always something. What is left is an empty
 * bordered card in a panel: a visible artefact that says nothing, which is
 * strictly worse than the gap it would fill, and the grid track is held by the
 * WRAPPING element in {@link Block} rather than by this one. `Accordion`
 * guards the structurally identical case for itself and {@link LeafCaption}
 * guards it for a caption; this is the third instance of one rule, not a new
 * one.
 *
 * It is also what a kind {@link LEAVES} does not name renders as. Every kind
 * the model admits now has a renderer, so that is no longer a gap being filled
 * in but the answer for a `kind` that reached the renderer from a payload
 * bypassing both the schema and the database — including one chosen to walk a
 * prototype chain.
 *
 * **Several kinds fall back HERE on their own terms**, which is a different
 * thing: {@link StatLeaf} and {@link TableLeaf} when the drop rule leaves no
 * pair to announce, {@link QuoteLeaf} when there are no words to quote,
 * {@link ProgressLeaf} when the value is not one `progressValue` can read, and
 * {@link PictureLeaf} when the address is one `safeHttpUrl` refuses. Each
 * shows its author's words rather than vanishing out of a grid track. The
 * list is named rather than counted, because a count in a comment goes stale
 * the moment a kind joins it — this one already had.
 *
 * The title is styled as a heading and is **not** a heading element. A leaf
 * sits at any depth the model admits, including one past the deepest level
 * {@link HEADING} names, so a real `<h*>` here would either skip or repeat a
 * level depending on what contains it — which is what axe's `heading-order`
 * names, though **that rule is `best-practice` and `a11y.spec.ts` runs only
 * the WCAG tags, so nothing in CI re-proves this against a browser.** What
 * holds it is the unit case `gives a leaf's own title no heading element`; see
 * `TAGS` in that spec for the verified list of which rules do and do not run.
 * The container above this carries the page's actual outline.
 *
 * @returns the words.
 *
 * Its type sizes are `em`-relative so a page's `spacing` reaches them; at the
 * default spacing they resolve to exactly the `rem` values they replaced,
 * which was measured against production element by element.
 *
 * Its card wears {@link CORNER_CLASS} rather than a fixed `rounded-xl`, so a
 * block's own `corners` can square any of them. That class is written out in
 * one file and interpolated everywhere else — eight copies of it is how a bar
 * and its cards stop agreeing, which opens a window's join and fails nothing.
 */
export function PlainLeaf({ leaf, locale, labelled }: LeafProps): ReactNode {
  const { title, description } = wordsOf(leaf, locale);
  const heading = labelled ? title : "";
  if (!heading && !description) return null;
  return (
    <div
      className={`grid gap-1 ${CORNER_CLASS} surface border-(--edge) bg-(--surface) p-5`}
    >
      {heading ? (
        <span className="font-display text-[0.875em]/tight font-bold">
          {title}
        </span>
      ) : null}
      {description ? (
        <p className="text-[0.75em]/relaxed text-(--muted)">{description}</p>
      ) : null}
    </div>
  );
}

/**
 * The card a `stat` and a `progress` sit on.
 *
 * Shared so the two cannot drift apart: they are the same card with a
 * different thing under the label, and a page that mixes them reads as one
 * row of tiles only while that stays true.
 */
const MEASURE_CARD = `${CORNER_CLASS} surface border-(--edge) bg-(--surface) p-(--block-pad)`;

/**
 * The treatment a LABEL gets on the kinds that invert the pair.
 *
 * **Small, muted and uppercase is what says "this is the label" rather than
 * "this is the heading"**, and it is the half of the inversion a reader
 * actually sees. Written once because `stat` and `progress` must agree: the
 * one thing this feature is most likely to get wrong is which of the two
 * fields is the label, and two independent class lists is how a fix reaches
 * one kind and not the other.
 */
const MEASURE_LABEL = "text-[0.75em] tracking-wide text-(--muted) uppercase";

/**
 * One measured fact: a label and the value it names.
 *
 * **The title is the LABEL and the description is the VALUE** — the reverse
 * of how the two read on `text` or `link`. A stat is "Species: arctic fox",
 * and the half worth setting large is the answer. The inversion is a
 * rendering fact rather than a schema one, so the fields keep their generic
 * names on the block and switching a kind to look at it finds what was typed
 * still there.
 *
 * **It is a `<dl>`, which is the debt `LEAF_KINDS` records being paid.** The
 * `two-column` layout this model replaced was a table of label and value, and
 * what made it worth having was not the two columns but the PAIRING: `dt` and
 * `dd` are announced together, where two spans are two unrelated runs of
 * text. `stat` is the home for one such pair and {@link TableLeaf} for many.
 *
 * **The drop rule comes with it, and it inverts at the edge.** A row whose
 * LOCALISED value is empty disappears, label and all — a `dt` with no `dd` is
 * invalid markup and half a row is not an option — and because the value is
 * read AFTER a language has been picked, a stat written in one language only
 * is a stat for readers of that language. But where the flat layout then
 * dropped the whole list, a leaf must not: it sits in a grid track its author
 * deliberately placed it in, so vanishing leaves a hole nothing explains. The
 * pair is dropped; the block falls back to {@link PlainLeaf} and shows its
 * label.
 *
 * A `labelled` of false is the other way to have no pair — an enclosing tab
 * or disclosure has already said the label — and the value renders alone
 * rather than as a `dd` with no `dt`, which is the same invalid half-row
 * seen from the other side.
 *
 * @param props - the leaf and how to read it.
 * @returns the pair, the value alone, or the label it could not pair.
 *
 * Its type sizes are `em`-relative so a page's `spacing` reaches them; at the
 * default spacing they resolve to exactly the `rem` values they replaced,
 * which was measured against production element by element.
 */
export function StatLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled } = props;
  const { title, description } = wordsOf(leaf, locale);
  if (!description) return PlainLeaf(props);
  const value = (
    <span className="font-display text-[1.125em]/tight font-bold">
      {description}
    </span>
  );
  if (!labelled || !title) {
    return (
      <div className={`grid gap-1 ${MEASURE_CARD}`} {...tid("block-stat")}>
        {value}
      </div>
    );
  }
  return (
    <dl className={`grid gap-1 ${MEASURE_CARD}`} {...tid("block-stat")}>
      <dt className={MEASURE_LABEL}>{title}</dt>
      <dd className="font-display text-[1.125em]/tight font-bold">
        {description}
      </dd>
    </dl>
  );
}

/**
 * One quotation, and who said it.
 *
 * **The description is what was said and the title is who said it** — the
 * second kind whose two fields do not mean "heading" and "body". Ported from
 * the flat `quote` layout, mark and em dash included.
 *
 * A quotation with no words is not a quotation, so an empty description falls
 * back to {@link PlainLeaf} — which still shows the attribution as its title,
 * rather than leaving a mark hanging over nothing. An enclosing tab that
 * already showed the attribution drops the caption and keeps the words, the
 * same choice {@link LeafCaption} makes.
 *
 * @param props - the leaf and how to read it.
 * @returns the quotation, or the words it could not attribute.
 *
 * Its type sizes are `em`-relative so a page's `spacing` reaches them; at the
 * default spacing they resolve to exactly the `rem` values they replaced,
 * which was measured against production element by element.
 *
 * Its card wears {@link CORNER_CLASS} rather than a fixed `rounded-xl`, so a
 * block's own `corners` can square any of them. That class is written out in
 * one file and interpolated everywhere else — eight copies of it is how a bar
 * and its cards stop agreeing, which opens a window's join and fails nothing.
 */
export function QuoteLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled } = props;
  const { title, description } = wordsOf(leaf, locale);
  if (!description) return PlainLeaf(props);
  return (
    <figure
      className={`grid gap-3 ${CORNER_CLASS} surface border-(--edge) bg-(--surface) p-5`}
      {...tid("block-quote")}
    >
      <QuoteMark className="size-5 text-(--accent)" />
      <blockquote className="font-display text-[1.125em]/snug text-balance">
        {description}
      </blockquote>
      {labelled && title ? (
        <figcaption className="text-[0.75em] text-(--muted) before:mr-1 before:content-['—']">
          {title}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * One proportion, drawn as a bar.
 *
 * **The title is the LABEL and the description is the VALUE**, the same
 * inversion {@link StatLeaf} carries and the single thing this feature is
 * most likely to get wrong — it has been got wrong once already. This kind
 * additionally tries to READ that value as a number, through
 * {@link progressValue}: a commission queue, a ref sheet's completion, a
 * species trait on a scale.
 *
 * **A value `progressValue` cannot read renders a plain row and NO BAR AT
 * ALL.** That is not a tidy-up; it is the whole guard. The failure this
 * refusal exists for is not a wrong number but a bar drawn from `NaN`, whose
 * `width` CSSOM rejects outright — the declaration is dropped, the fill falls
 * back to `auto`, and the bar renders FULL. A bar reading 100% on nonsense
 * looks like an answer, which is the worst outcome this layout has. The
 * refusal must therefore be asserted on the RENDERED output rather than on
 * what the parser returned, because the original fault survived a suite that
 * only checked the latter.
 *
 * A value it CAN read still renders verbatim beside the bar, so nothing an
 * author wrote is hidden behind the percentage it was turned into.
 *
 * **The bar is named even when the label is not shown.** `aria-label` falls
 * back to the value itself, which is a true thing to say about the bar — a
 * `progressbar` with no accessible name is a control a screen reader can only
 * call "progress bar", and the bar renders only when the value parsed, so the
 * fallback is never empty.
 *
 * @param props - the leaf and how to read it.
 * @returns the bar, or the row it could not draw one from.
 *
 * Its type sizes are `em`-relative so a page's `spacing` reaches them; at the
 * default spacing they resolve to exactly the `rem` values they replaced,
 * which was measured against production element by element.
 */
export function ProgressLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled } = props;
  const { title, description } = wordsOf(leaf, locale);
  const label = labelled ? title : "";
  // Neither half left to show — a tab lifted the label and the value is
  // unwritten. The card would be an empty bordered box, since its own row and
  // its bar are all conditional; {@link PlainLeaf} answers that case for every
  // kind in one place.
  if (!label && !description) return PlainLeaf(props);
  const percent = progressValue(description);
  return (
    <div className={`grid gap-2 ${MEASURE_CARD}`} {...tid("block-progress")}>
      <div className="flex items-baseline justify-between gap-3">
        {label ? <span className={MEASURE_LABEL}>{title}</span> : null}
        {description ? (
          <span className="font-display text-[0.875em] font-bold">
            {description}
          </span>
        ) : null}
      </div>
      {percent === null ? null : (
        <div
          role="progressbar"
          aria-label={title || description}
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full surface border-(--edge) bg-(--bar)"
        >
          <div
            className="h-full rounded-full bg-(--accent)"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** One cell of a {@link TableLeaf}, read in the language being read. */
interface TableCell {
  /** Its text, falling back to English. */
  text: string;
  /**
   * Its position in the row, as a key.
   *
   * **A cell carries no identity of its own** — no id and no sort order,
   * because the array's order IS the order — so its position is the only
   * thing distinguishing it from a neighbour holding identical words. Derived
   * here rather than at the `key` prop for the reason `seatsOf` does the
   * same: `react/no-array-index-key` reads the map callback's index parameter
   * and this file has no other identity to offer.
   */
  key: string;
}

/** One row of a {@link TableLeaf}, split into the pair it announces. */
interface TableRow {
  /**
   * Its first cell, which becomes the row's header.
   *
   * `""` for a row whose author left the first cell blank, and for a row with
   * no cells at all — neither survives as an excuse to render nothing.
   */
  label: string;
  /**
   * Its remaining cells, which are the values the row states.
   *
   * **This is what the drop rule reads**, never the label: a label with
   * nothing beside it is the half-row the `<dl>` debt refuses.
   */
  values: TableCell[];
  /** Its position in the table, as a key — see {@link TableCell.key}. */
  key: string;
  /**
   * The mark drawn beside the label, from the row's FIRST cell.
   *
   * Empty draws nothing at all rather than a fallback mark: a table of stats
   * is the ordinary case and a column of identical placeholder icons beside
   * it is noise. That is the opposite of {@link LinkLeaf}, where a link with
   * no icon still gets one, and it is a different question — there the mark
   * says "this is a link", here it says whatever its author meant by it.
   */
  icon: string;
}

/**
 * A `table` leaf's rows, read in the language being read.
 *
 * Every row is split into its header and its values, because that split is
 * what the drop rule and the markup both need and computing it twice is how
 * the two stop agreeing.
 *
 * **Nothing is dropped here.** The filter belongs to {@link TableLeaf}, which
 * has somewhere to fall back to when nothing survives; a helper that returned
 * an already-filtered list would hide the empty case from the one function
 * that has to answer for it.
 *
 * `table`, `player` and `jukebox` are the only kinds that read `rows` — see
 * the actors feature note for why that is worth saying explicitly rather
 * than assuming. This function is `table`'s own reader; `playlistFromRows`
 * (`domain/playlist.ts`) is the other, reading the same field as a playlist
 * for the two retro players.
 *
 * @param leaf - the leaf, whose `rows` may be absent — every kind stores the
 *   field regardless of whether it reads it.
 * @param locale - the locale being read.
 * @returns one entry per stored row, in the order the author put them.
 */
function tableRows(leaf: LeafBlock, locale: string): TableRow[] {
  // **Shape-checked rather than trusted, at both levels.** Every other lookup
  // in this file is explicitly defensive about a payload that bypassed the
  // schema and the database alike — it is why `MODES` and `LEAVES` are `Map`s
  // and why an unknown `kind` renders rather than throwing. `rows` arrives from
  // the same `jsonb`, and a stored object where an array is expected, or a
  // string where a row is expected, would be a `TypeError` thrown DURING a
  // public page render. That is the `TIDAL_KINDS` failure exactly, from the one
  // place the file stopped being paranoid.
  const rows = Array.isArray(leaf.rows) ? leaf.rows : [];
  return rows.map((row, position) => {
    const cells = Array.isArray(row) ? row : [];
    const [head, ...values] = cells.map((cell, column) => ({
      text: contentFor(cell, "text", locale),
      key: String(column),
    }));
    // **Read off the raw first cell, not off `head`** — the mapped shape
    // carries the localised text and nothing else, and widening it would put
    // an icon field on every value cell where nothing reads one.
    const first = Array.isArray(row) ? row[0] : undefined;
    const icon = typeof first?.icon === "string" ? first.icon : "";
    return { label: head?.text ?? "", values, icon, key: String(position) };
  });
}

/**
 * Many pairs at once: rows of a label and the values beside it.
 *
 * **This is `stat` generalised, and it carries the same debt** — see
 * `LEAF_KINDS`' TSDoc. A real `<table>` with `<th scope="row">` on the first
 * cell keeps the property that made `two-column` worth having: a screen
 * reader announces the row header WITH each value, so a label and its value
 * are heard as a pair rather than as two unrelated runs of text. A `<dl>`
 * cannot do it past two columns and the model allows eight, so the table is
 * the shape that generalises without losing the pairing.
 *
 * **A row whose localised values are all empty disappears entirely, label and
 * all.** Half a row is not an option, and the values are read AFTER a
 * language has been picked — so a row written in one language only is a row
 * for readers of that language, which is the ordinary fallback made visible
 * because here it decides a whole row. A row with a label and no value cells
 * at all is the same case and goes the same way.
 *
 * **When NO row survives it falls back to {@link PlainLeaf} rather than
 * rendering nothing**, and that is where this deliberately parts from the
 * layout it inherits. The flat `two-column` dropped the whole list, correctly:
 * an item was one row among others and dropping it closed the gap. A block
 * sits in a grid track its author deliberately placed it in, so a leaf that
 * vanished would leave a hole nothing on the page explains. Absent `rows`
 * takes the same path, which is what a `table` looks like the moment it is
 * added.
 *
 * **The table scrolls inside its own box.** Eight columns of real words do
 * not fit a 320px viewport, and a table that overflowed would scroll the
 * whole PAGE sideways — the one failure the responsive suite exists to catch.
 *
 * The caption carries the leaf's title and description, which is where a
 * table's words go: everything else is a cell somebody wrote. An enclosing
 * tab that already showed the title drops that half and keeps the
 * description.
 *
 * @param props - the leaf and how to read it.
 * @returns the table, or the words it could not fill one with.
 *
 * **A row may carry a mark, read from its FIRST cell and drawn in the `<th>`**
 * beside the label — a contact box from 2004 has a small icon on every line.
 * One per row rather than one per cell, because a mark on a value cell would
 * sit in the middle of the text it decorates. An absent or unknown name draws
 * NOTHING rather than a fallback, which is the opposite of {@link LinkLeaf}
 * and a different question: there the mark says "this is a link", here it says
 * whatever its author meant by it, and a column of identical placeholders
 * beside a table of stats is noise.
 *
 * Its type sizes are `em`-relative so a page's `spacing` reaches them; at the
 * default spacing they resolve to exactly the `rem` values they replaced,
 * which was measured against production element by element.
 *
 * Its card wears {@link CORNER_CLASS} rather than a fixed `rounded-xl`, so a
 * block's own `corners` can square any of them. That class is written out in
 * one file and interpolated everywhere else — eight copies of it is how a bar
 * and its cards stop agreeing, which opens a window's join and fails nothing.
 */
export function TableLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled } = props;
  const { title, description } = wordsOf(leaf, locale);
  const rows = tableRows(leaf, locale).filter((row) =>
    row.values.some((cell) => cell.text !== ""),
  );
  if (rows.length === 0) return PlainLeaf(props);
  const caption = labelled ? title : "";
  return (
    <div
      className={`overflow-x-auto ${CORNER_CLASS} surface border-(--edge) bg-(--surface)`}
    >
      <table className="w-full" {...tid("block-table")}>
        {caption || description ? (
          <caption className="px-5 py-3.5 text-left">
            {/* A `<div>` inside the caption rather than `display: grid` ON it.
                A `<caption>` is `display: table-caption` in every UA sheet, and
                overriding that would take the element out of the table's own
                caption box and leave a grid box among the table's anonymous
                boxes — a layout question jsdom cannot answer, so it is avoided
                rather than guessed at. */}
            <div className="grid gap-1">
              {caption ? (
                <span className="font-display text-[0.875em]/tight font-bold">
                  {caption}
                </span>
              ) : null}
              {description ? (
                <span className="text-[0.75em]/relaxed text-(--muted)">
                  {description}
                </span>
              ) : null}
            </div>
          </caption>
        ) : null}
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-(--edge)/25 last:border-b-0 even:bg-(--bar)"
            >
              <th
                scope="row"
                className="border-r border-(--edge)/25 px-5 py-3.5 text-left font-display text-[0.875em] font-bold"
              >
                {row.icon ? (
                  <span className="flex items-center gap-2">
                    <PublicSectionIcon name={row.icon} fallback="" />
                    {row.label}
                  </span>
                ) : (
                  row.label
                )}
              </th>
              {row.values.map((cell) => (
                <td
                  key={cell.key}
                  className="px-5 py-3.5 text-[0.875em]/relaxed"
                >
                  {cell.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
