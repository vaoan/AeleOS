import { ExternalLink, Plus, Quote as QuoteMark } from "lucide-react";
import { contentFor } from "@/features/actors/domain/actor-content";
import { resolveEmbed, safeHttpUrl } from "@/features/actors/domain/embeds";
import type {
  FursonaSection,
  FursonaSectionItem,
  SectionType,
} from "@/features/actors/domain/section-schema";
import { PublicSectionIcon } from "@/features/actors/presentation/public-section-icon";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link PublicSections} needs. */
export interface PublicSectionsProps {
  /** What the author wrote. */
  sections: FursonaSection[];
  /** The locale being read, which decides which language is preferred. */
  locale: string;
}

/**
 * One item's words in the language being read.
 *
 * @param item - the item.
 * @param locale - the locale being read.
 * @returns its title and description, each falling back to English.
 */
const wordsOf = (item: FursonaSectionItem, locale: string) => ({
  title: contentFor(item, "title", locale),
  description: contentFor(item, "description", locale),
});

/**
 * A key derived from what the author stored, rather than from array position.
 *
 * Index keys would in fact be safe here — nothing on this page reorders, adds
 * or removes anything — but a key that survives a future where something does
 * costs nothing now, and `sort_order` is the value `0009` actually stores.
 *
 * @param order - the entry's stored order.
 * @param label - its English name or title, which is required by the schema.
 * @returns a stable key.
 */
const keyOf = (order: number, label: string) => `${order}-${label}`;

/**
 * What a card shows when its author chose no icon.
 *
 * A card without one is a ragged box in a row of anchored ones, so the tile is
 * never empty. Deliberately neutral: it has to stand in for anything somebody
 * might have written about, and a shape that means something would be wrong
 * more often than it was right.
 */
const CARD_ICON = "circle-dot";

/**
 * A section laid out as cards.
 *
 * **A row that scrolls sideways until it is wide enough to be a grid**, which
 * is Libra's structure and the part two earlier attempts here missed. Cards are
 * fixed-width tiles: `w-56` while the row scrolls, `lg:w-auto` once three of
 * them fit. A fluid `sm:grid-cols-2 lg:grid-cols-3` was what this had before,
 * and a fluid grid of bordered boxes does not read as cards — it reads as a
 * list that happens to have gaps in it.
 *
 * **On a phone they stack, and the row starts at `sm`.** A 224px tile beside
 * another one on a 360px screen shows a card and a sliver of the next, which
 * reads as the page having been cut rather than as an invitation to swipe — and
 * a sideways scroll inside a page that itself scrolls down is the gesture most
 * often missed entirely. So the smallest screen gets full-width cards, one per
 * row. The argument above still holds everywhere it can be seen: the tiles, the
 * icon anchors and the row all survive from `sm` up.
 *
 * `carousel` is the layout that keeps scrolling sideways at every size, and
 * that is the difference between the two: one is a set of cards, the other is
 * a thing you swipe through. Somebody who wants the second picks it by name.
 *
 * **Every card carries an icon tile, including the ones with no icon set.** The
 * tile is what gives a card its anchor, and rendering it only sometimes makes a
 * row of them ragged — which was the other half of why these did not look like
 * cards. An item with no icon, or with a name lucide does not have, gets the
 * default rather than a hole.
 *
 * @returns the cards.
 */
function Cards({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div
      className="grid gap-4 sm:flex sm:overflow-x-auto sm:pb-3 lg:grid lg:grid-cols-3 lg:pb-0"
      {...tid("public-cards")}
    >
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="flex w-full flex-col gap-3 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-5 sm:w-56 sm:shrink-0 lg:w-auto"
          >
            <span className="grid size-11 w-fit place-items-center rounded-lg border border-[var(--edge)] bg-[var(--bar)]">
              <PublicSectionIcon name={item.icon} fallback={CARD_ICON} />
            </span>
            <h3 className="font-display text-sm/tight font-bold">{title}</h3>
            {description ? (
              <p className="text-xs/relaxed text-[var(--muted)]">
                {description}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A section laid out as disclosures.
 *
 * `<details>` and `<summary>`, deliberately: this is the one page in the app a
 * stranger might reach on a hostile network or an old browser, and a disclosure
 * that needs no script is free.
 *
 * **It shows a marker that flips open, and the items share one container.** The
 * first version had neither — a bare `<summary>` with the browser's triangle
 * suppressed by the reset, each item in its own box. Nothing said it opened,
 * and a stack of separate boxes is not an accordion. The plus rotates into a
 * cross on open, which needs no JavaScript either.
 *
 * @returns the disclosures.
 */
function Accordion({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--edge)] bg-[var(--surface)]">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <details
            key={keyOf(item.sort_order, item.title_en)}
            className="group border-b border-[var(--edge)]/25 last:border-b-0"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 font-display font-bold [&::-webkit-details-marker]:hidden">
              {title}
              <Plus className="size-5 shrink-0 text-[var(--muted)] transition-transform group-open:rotate-45" />
            </summary>
            {description ? (
              <p className="border-t border-[var(--edge)]/25 bg-[var(--bar)] px-5 py-4 text-sm/relaxed text-[var(--muted)]">
                {description}
              </p>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}

/**
 * A section laid out in two columns.
 *
 * **This is a table of label and value, not a two-column grid of items** — the
 * distinction the first version missed entirely. "Two columns" names the shape
 * of each ROW: the label on the left against a rule, its value on the right.
 * A grid of title-and-paragraph blocks is a different layout that happened to
 * have two of them per row.
 *
 * A description list, because that is exactly what it is: `dt` is the label and
 * `dd` is the value, which a screen reader announces as a pair.
 *
 * **A row with no value does not render, and neither does a list with no rows.**
 * That pairing is the reason: a `dt` without its `dd` is invalid markup, and the
 * answer is to drop both rather than to render half a row. An earlier version
 * kept the blank cell and called it "a row still to be filled in" — but a label
 * with nothing beside it is noise on a page strangers read, and the label comes
 * back the moment its owner writes the value.
 *
 * The empty list matters as much as the empty row: `dl` carries the border and
 * the surface, so a section whose every value is unwritten would otherwise be a
 * bordered box with nothing in it — the same blank cell, one level up.
 *
 * This is the only layout that drops a whole ITEM rather than one element of
 * one. Everywhere else a title with no description is a perfectly good card;
 * here it is half a pair.
 *
 * @returns the table, or nothing when no row has a value.
 */
function TwoColumn({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  const rows = items.filter((item) => wordsOf(item, locale).description);
  if (rows.length === 0) return null;
  return (
    <dl className="grid overflow-hidden rounded-xl border border-[var(--edge)] bg-[var(--surface)]">
      {rows.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="flex items-stretch border-b border-[var(--edge)]/25 last:border-b-0 even:bg-[var(--bar)]"
          >
            <dt className="w-1/3 shrink-0 border-r border-[var(--edge)]/25 px-5 py-3.5 font-display text-sm font-bold">
              {title}
            </dt>
            <dd className="flex-1 px-5 py-3.5 text-sm/relaxed">
              {description}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * A section laid out as pictures.
 *
 * **An item with no image address is skipped entirely**, rather than rendering a
 * broken image with a caption under it. Somebody who added a slot and has not
 * filled it in yet should see nothing there, not a failure.
 *
 * @returns the gallery.
 */
function Gallery({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  const shown = items.filter((item) => Boolean(item.image_url));
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <figure
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for. */}
            <img
              src={item.image_url}
              alt={title}
              className="w-full rounded-xl border border-[var(--edge)] object-cover"
            />
            {description ? (
              <figcaption className="text-xs text-[var(--muted)]">
                {description}
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

/**
 * One embedded player, or the link it could not resolve to one.
 *
 * **`resolveEmbed` decides the address, never the author.** What it returns is
 * built from a template on an allowlisted host, so the value stored on the item
 * cannot reach the frame — see that function's TSDoc for the whole argument.
 *
 * Anything it refuses renders as a plain link rather than as nothing. Silence
 * would leave somebody looking at a gap on their own page with no way to learn
 * that the address they pasted is not one this hub can play.
 *
 * The frame is sandboxed, lazy, and asks for no autoplay permission. A profile
 * that starts making noise at whoever opened it is the thing people remember
 * most fondly and least accurately about the pages this is modelled on; the
 * layouts are welcome back, that part is not.
 *
 * @returns the player, the link, or nothing when the author left it empty.
 */
function Player({
  url,
  title,
  fallback,
}: {
  url: string | undefined;
  title: string;
  fallback: string;
}) {
  const embed = resolveEmbed(url);
  if (!embed) {
    const href = safeHttpUrl(url);
    return href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="inline-flex items-center gap-2 text-sm text-[var(--accent)] underline underline-offset-4"
      >
        <ExternalLink className="size-4 shrink-0" />
        {fallback}
      </a>
    ) : null;
  }

  return (
    <iframe
      src={embed.src}
      title={title}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      // No `autoplay`. Everything else is what a player legitimately needs.
      allow="clipboard-write; encrypted-media; picture-in-picture; fullscreen"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      className={
        embed.shape === "video"
          ? "aspect-video w-full rounded-xl border border-[var(--edge)]"
          : "h-[10.5rem] w-full rounded-xl border border-[var(--edge)]"
      }
    />
  );
}

/**
 * A section of embedded videos.
 *
 * @returns the videos.
 */
function Video({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <figure
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-2"
          >
            <Player url={item.link_url} title={title} fallback={title} />
            <figcaption className="grid gap-1">
              <h3 className="font-display font-bold">{title}</h3>
              {description ? (
                <p className="text-sm/relaxed text-[var(--muted)]">
                  {description}
                </p>
              ) : null}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * A section of embedded music.
 *
 * One column rather than a grid: a player is a wide, short thing, and two side
 * by side leaves each too narrow to show a track name.
 *
 * @returns the players.
 */
function Music({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="grid gap-5">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-2"
          >
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3 className="font-display font-bold">{title}</h3>
              {description ? (
                <p className="text-sm text-[var(--muted)]">{description}</p>
              ) : null}
            </div>
            <Player url={item.link_url} title={title} fallback={title} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * A section of pictures on one swipeable row.
 *
 * **Scroll snapping rather than JavaScript.** A carousel is the layout most
 * often built as a client component with a timer and two arrow buttons; CSS
 * does the same job here, so this file stays a server component, every picture
 * is reachable in order by keyboard and by a screen reader, and nothing moves
 * on its own while somebody is reading.
 *
 * Items with no picture are dropped, exactly as the gallery drops them.
 *
 * @returns the carousel.
 */
function Carousel({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  const shown = items.filter((item) => Boolean(item.image_url));
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3">
      {shown.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <figure
            key={keyOf(item.sort_order, item.title_en)}
            className="grid w-[85%] shrink-0 snap-center gap-2 sm:w-96"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for. */}
            <img
              src={item.image_url}
              alt={title}
              className="aspect-4/3 w-full rounded-xl border border-[var(--edge)] object-cover"
            />
            <figcaption className="text-xs text-[var(--muted)]">
              <span className="font-medium text-[var(--ink)]">{title}</span>
              {description ? ` ${description}` : null}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * A section of links out.
 *
 * **Every address goes through `safeHttpUrl`, and one that fails renders as
 * plain text rather than as a link.** React escapes text and not URL schemes,
 * so an anchor is the one place on this page where what somebody pasted would
 * otherwise become script running in the reader's session.
 *
 * They carry `nofollow ugc` as well as `noopener noreferrer`. The second pair
 * is about the reader's tab; the first is about this being a page anybody can
 * publish links on, which is a thing search engines are entitled to know before
 * a fursona page becomes a way to buy ranking.
 *
 * @returns the links.
 */
function Links({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        const href = safeHttpUrl(item.link_url);
        const inside = (
          <>
            {item.icon ? (
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--edge)] bg-[var(--bar)]">
                <PublicSectionIcon name={item.icon} />
              </span>
            ) : null}
            <span className="grid gap-0.5">
              <span className="font-display text-sm font-bold">{title}</span>
              {description ? (
                <span className="text-xs text-[var(--muted)]">
                  {description}
                </span>
              ) : null}
            </span>
          </>
        );
        const shape =
          "flex items-center gap-3 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4";
        return href ? (
          <a
            key={keyOf(item.sort_order, item.title_en)}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className={`${shape} transition-colors hover:border-[var(--accent)]`}
          >
            {inside}
          </a>
        ) : (
          <div key={keyOf(item.sort_order, item.title_en)} className={shape}>
            {inside}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A section of short facts.
 *
 * The title is the LABEL and the description is the VALUE, which is the reverse
 * of how the two read on every other layout — a stat is "Species: arctic fox",
 * and the half worth setting large is the answer. The editor names the fields
 * accordingly rather than leaving somebody to discover it by saving.
 *
 * @returns the stats.
 */
function Stats({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-1 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4"
          >
            <span className="text-xs tracking-wide text-[var(--muted)] uppercase">
              {title}
            </span>
            {description ? (
              <span className="font-display text-lg leading-tight font-bold">
                {description}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A section of quotations.
 *
 * The description is what was said and the title is who said it, so this is the
 * other layout whose two fields do not mean what they mean elsewhere.
 *
 * @returns the quotations.
 */
function Quotes({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <figure
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-3 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-5"
          >
            <QuoteMark className="size-5 text-[var(--accent)]" />
            {description ? (
              <blockquote className="font-display text-lg leading-snug text-balance">
                {description}
              </blockquote>
            ) : null}
            <figcaption className="text-xs text-[var(--muted)] before:content-['—'] before:mr-1">
              {title}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * A section of entries in order.
 *
 * The rule down the left is a border on the list rather than an element per
 * row, so nothing decorative lands in the accessibility tree — a screen reader
 * gets an ordinary ordered list of headings and paragraphs.
 *
 * @returns the timeline.
 */
function Timeline({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <ol className="grid gap-6 border-l border-[var(--edge)] pl-6">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <li
            key={keyOf(item.sort_order, item.title_en)}
            className="relative grid gap-1"
          >
            <span
              aria-hidden
              className="absolute top-1.5 -left-7.5 size-3 rounded-full border-2 border-[var(--surface)] bg-[var(--accent)]"
            />
            <h3 className="font-display font-bold">{title}</h3>
            {description ? (
              <p className="text-sm/relaxed text-[var(--muted)]">
                {description}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Every layout, by the name stored on the section.
 *
 * A lookup rather than a chain of tests, and the TYPE is what makes it safe:
 * `Record<SectionType, …>` fails to compile the moment `SECTION_TYPES` gains a
 * name with no renderer behind it. The chain of ternaries this replaced would
 * have compiled happily and rendered a heading with nothing underneath it.
 *
 * @returns nothing — this is the table, not a function.
 */
const LAYOUTS: Record<
  SectionType,
  (props: { items: FursonaSectionItem[]; locale: string }) => React.ReactNode
> = {
  cards: Cards,
  accordion: Accordion,
  "two-column": TwoColumn,
  gallery: Gallery,
  video: Video,
  music: Music,
  carousel: Carousel,
  links: Links,
  stats: Stats,
  quote: Quotes,
  timeline: Timeline,
};

/**
 * Everything an actor wrote about themselves, laid out as they chose.
 *
 * A **server component**, and the whole file is written to stay one. The only
 * client code on a public page is `PublicSectionIcon`, because lazy-loading a
 * glyph needs it — see that file for why the boundary is drawn there.
 *
 * Every string comes through `contentFor`, so the locale's language is
 * preferred and English is the fallback. An actor with nothing written renders
 * **nothing at all** rather than an empty-state message: a page with no sections
 * is a page somebody has not finished, and a stranger has no use for being told
 * so.
 *
 * **The layout is chosen from the `LAYOUTS` record, not by a chain of tests.**
 * That record is typed `Record<SectionType, …>`, so a layout added to
 * `SECTION_TYPES` with no renderer behind it fails to compile — where the chain
 * of ternaries this replaced would have compiled happily and rendered a heading
 * with nothing underneath it.
 *
 * Three of the layouts frame third-party players, and **none of them frames an
 * address an author supplied.** `resolveEmbed` builds every `src` from a
 * template on an allowlisted host, and `safeHttpUrl` guards every `href`; see
 * `domain/embeds.ts` for the whole argument. This file must never grow a branch
 * that puts a stored value into either attribute directly.
 *
 * Each section heading carries the `public-section` test id, so the end-to-end
 * suite can assert that what somebody wrote in the editor reached a stranger's
 * browser — without depending on the author's own words, which are data, or on
 * a translation, which the e2e rules forbid asserting.
 *
 * Sections are spaced further apart than the items inside them, and a section
 * heading outweighs an item title. Without that the page is one flat list of
 * everything somebody wrote, which is how it read before.
 *
 * @returns the sections, in the order the author put them.
 */
export function PublicSections({ sections, locale }: PublicSectionsProps) {
  if (sections.length === 0) return null;

  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="grid gap-10">
      {ordered.map((section) => {
        const items = [...section.items].sort(
          (a, b) => a.sort_order - b.sort_order,
        );
        const Layout = LAYOUTS[section.type];
        return (
          <section
            key={keyOf(section.sort_order, section.name_en)}
            className="grid gap-3"
          >
            <h2
              className="font-display text-2xl font-bold tracking-tight"
              {...tid("public-section")}
            >
              {contentFor(section, "name", locale)}
            </h2>
            <Layout items={items} locale={locale} />
          </section>
        );
      })}
    </div>
  );
}
