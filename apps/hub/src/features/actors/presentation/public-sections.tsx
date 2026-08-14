import { contentFor } from "@/features/actors/domain/actor-content";
import type {
  FursonaSection,
  FursonaSectionItem,
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
 * A section laid out as cards, each with an optional icon.
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
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-2 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4"
          >
            <div className="flex items-center gap-2">
              <PublicSectionIcon name={item.icon} />
              <h3 className="font-display text-sm font-bold">{title}</h3>
            </div>
            <p className="text-sm text-[var(--muted)]">{description}</p>
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
 * widget that needs no script is free.
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
    <div className="grid gap-2">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <details
            key={keyOf(item.sort_order, item.title_en)}
            className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4"
          >
            <summary className="cursor-pointer font-display text-sm font-bold">
              {title}
            </summary>
            <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
          </details>
        );
      })}
    </div>
  );
}

/**
 * A section laid out in two columns.
 *
 * @returns the columns.
 */
function TwoColumn({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-1.5"
          >
            <h3 className="font-display text-sm font-bold">{title}</h3>
            <p className="text-sm text-[var(--muted)]">{description}</p>
          </div>
        );
      })}
    </div>
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
    <div className="grid gap-4 sm:grid-cols-3">
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
            <figcaption className="text-xs text-[var(--muted)]">
              {description}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

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
 * Each section heading carries the `public-section` test id, so the end-to-end
 * suite can assert that what somebody wrote in the editor reached a stranger's
 * browser — without depending on the author's own words, which are data, or on
 * a translation, which the e2e rules forbid asserting.
 *
 * @returns the sections, in the order the author put them.
 */
export function PublicSections({ sections, locale }: PublicSectionsProps) {
  if (sections.length === 0) return null;

  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="grid gap-8">
      {ordered.map((section) => {
        const items = [...section.items].sort(
          (a, b) => a.sort_order - b.sort_order,
        );
        return (
          <section
            key={keyOf(section.sort_order, section.name_en)}
            className="grid gap-3"
          >
            <h2
              className="font-display text-lg font-bold tracking-tight"
              {...tid("public-section")}
            >
              {contentFor(section, "name", locale)}
            </h2>
            {section.type === "cards" ? (
              <Cards items={items} locale={locale} />
            ) : null}
            {section.type === "accordion" ? (
              <Accordion items={items} locale={locale} />
            ) : null}
            {section.type === "two-column" ? (
              <TwoColumn items={items} locale={locale} />
            ) : null}
            {section.type === "gallery" ? (
              <Gallery items={items} locale={locale} />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
