import { describe, expect, it, vi } from "vitest";
import { pageContext } from "./helpers/page-context";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import messages from "@/shared/infrastructure/i18n/messages/en.json";
import {
  DESCRIBED_KINDS,
  LEAF_FIELDS,
  leafFields,
  type LeafFields,
} from "@/features/actors/domain/leaf-fields";
import {
  LEAF_KINDS,
  type LeafBlock,
  type LeafKind,
} from "@/features/actors/domain/block-schema";

// THE TABLE IS PINNED TO THE RENDERER, NOT TRUSTED AGAINST IT.
//
// `LEAF_FIELDS` says, per content kind, whether the renderer reads the
// address, the icon, the picture, the rows and the description — and the
// editor offers exactly what it says yes to, because a control that accepts
// what somebody types, stores it, refuses nothing and renders nothing is the
// worst kind there is.
//
// A table like that is the shape that goes stale in silence: `blocks.tsx`
// moves, nothing about these types changes, and `check:docs` has nothing to
// compare — rule 18 in the root CLAUDE.md, in its own words, is that a
// freshness check catches a symbol whose CODE moved and cannot catch one whose
// WORLD moved. So every claim below is measured against the real renderer:
// each kind is drawn in every state it can reach, with a field written and
// without, and the markup has to differ exactly when the table says so.
//
// A `PublicSectionIcon` is the one client component on a public page and lazy
// loads its glyph, so it is stubbed to something that renders the NAME it was
// given — which is what makes an icon's presence observable in static markup
// at all.
vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <i data-icon={name} />,
  iconNames: ["paw-print", "link", "globe"],
}));

const { LEAVES } = await import("@/features/actors/presentation/blocks");

/** A leaf carrying nothing optional at all. */
const bare = (kind: LeafKind): LeafBlock => ({
  kind,
  title_en: "A title",
  description_en: "",
});

/** An address every provider table in this app recognises. */
const FRAMEABLE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

/**
 * The states one kind's renderer can actually reach, as leaves to draw.
 *
 * **More than one, and that is the finding rather than a nicety.** `player`
 * and `post` frame an address they recognise and fall back to a link or a
 * branded chip otherwise, and the two paths read DIFFERENT fields: the frame
 * shows a caption built from the description, the chip shows an icon and no
 * description at all. A single baseline measures one path and reports the
 * other's fields as unread — which is what the first version of this suite
 * did, and it disagreed with the renderer on three cases.
 *
 * So a field counts as drawn when it changes what a reader sees in ANY state
 * the kind can reach, which is exactly the editor's obligation: offer a
 * control when there is a way for somebody to see what it did.
 *
 * @param kind - the content kind.
 * @returns one leaf per reachable state.
 */
function statesOf(kind: LeafKind): LeafBlock[] {
  const plain = bare(kind);
  return leafFields(kind).link
    ? [plain, { ...plain, link_url: FRAMEABLE }]
    : [plain];
}

/** What each optional field is written with when a case wants it present. */
const WRITTEN: Record<keyof LeafFields, Partial<LeafBlock>> = {
  description: { description_en: "A description." },
  link: { link_url: FRAMEABLE },
  // Not a field of its own — it decides which HINT the editor shows for
  // `link_url`, not whether a value is read — so it is checked separately
  // below rather than by drawing anything.
  embeds: {},
  icon: { icon: "paw-print" },
  picture: { image_url: "https://example.test/p.png" },
  rows: { rows: [[{ text_en: "Species" }, { text_en: "A wolf" }]] },
};

/**
 * One leaf as its own kind's renderer draws it.
 *
 * @param leaf - the leaf to draw.
 * @returns the static markup.
 */
function draw(leaf: LeafBlock): string {
  const render = LEAVES.get(leaf.kind);
  if (!render) throw new Error(`no renderer for ${leaf.kind}`);
  // **Wrapped in the REAL provider with the REAL catalogue.** The retro player
  // leaves are the first to reach for `useTranslations`, and rendering them
  // bare throws — which is honest rather than inconvenient, because every page
  // in this app renders inside `NextIntlClientProvider`. Stubbing the
  // translation function would have measured a different program; supplying
  // what production supplies means a missing catalogue key fails HERE too.
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {render({ leaf, locale: "en", labelled: true, page: pageContext() })}
    </NextIntlClientProvider>,
  );
}

describe("LEAF_FIELDS", () => {
  // Without this the assertions below hold for an empty map, which is the
  // shape a renamed constant would leave behind.
  it("has an entry for every kind in the vocabulary, and no other", () => {
    expect([...LEAF_FIELDS.keys()].sort()).toEqual([...LEAF_KINDS].sort());
  });

  // The exclusions are named rather than filtered by the same predicate
  // `DESCRIBED_KINDS` is built from, which would be tautological. `social` is
  // a chip with a label and nowhere to put prose; the five identity kinds show
  // the ACTOR's content and have no prose of their own to write.
  it("names the kinds that draw a description, in vocabulary order", () => {
    const withoutDescription = new Set([
      "social",
      "avatar",
      "handle",
      "name",
      "owner",
      "fursonas",
    ]);
    expect(DESCRIBED_KINDS).toEqual(
      LEAF_KINDS.filter((kind) => !withoutDescription.has(kind)),
    );
  });

  // A KIND THIS BUILD HAS NEVER HEARD OF is reachable: the lenient read admits
  // a name a newer deployment wrote, and `LEAVES.get(kind) ?? PlainLeaf` draws
  // it as a plain card. So the honest answer for one is a title, a description
  // and nothing else.
  it("answers a plain card for a kind it does not know", () => {
    expect(leafFields("diagram")).toEqual({
      description: true,
      link: false,
      embeds: false,
      icon: false,
      picture: false,
      rows: false,
    });
  });

  // A `Map` rather than a record, because a leaf's `kind` is wider than the
  // vocabulary and arrives from `jsonb` — the shape that put `__proto__`
  // through `TIDAL_KINDS` and shipped a Critical.
  it("finds nothing inherited from Object.prototype", () => {
    expect(LEAF_FIELDS.get("__proto__")).toBeUndefined();
    expect(LEAF_FIELDS.get("constructor")).toBeUndefined();
    expect(leafFields("toString").rows).toBe(false);
  });
});

describe("what the renderer actually reads", () => {
  // ONE CASE PER KIND PER FIELD, driven from the vocabulary rather than
  // listed, so a kind added later is covered the moment it is added.
  const cases = LEAF_KINDS.flatMap((kind) =>
    (["description", "link", "icon", "picture", "rows"] as const).map(
      (field) => [kind, field] as const,
    ),
  );

  it.each(cases)(
    "a %s leaf draws its %s exactly when the table says so",
    (kind, field) => {
      const drawn = statesOf(kind).some(
        (state) => draw({ ...state, ...WRITTEN[field] }) !== draw(state),
      );
      expect(drawn).toBe(leafFields(kind)[field]);
    },
  );

  // The anti-vacuity check the cases above need: if `draw` returned the same
  // markup for everything — a stubbed renderer, a thrown-away argument — every
  // "does not read it" case would pass and every "reads it" case would fail
  // together, which is a signature worth being able to tell from a real
  // disagreement.
  it("draws different markup for different kinds", () => {
    const drawn = new Set(LEAF_KINDS.map((kind) => draw(bare(kind))));
    expect(drawn.size).toBeGreaterThan(1);
  });
});

describe("embeds", () => {
  // NARROWER THAN `link` ON PURPOSE, and the difference is what the field's
  // hint may promise: `player` and `post` frame what they recognise, while
  // `link` and `social` always draw a button or a chip whatever host was
  // pasted. One hint vague enough to cover both would be true of neither.
  it("is claimed only by kinds that put an address in a frame", () => {
    // One kind since the merge. `embed` absorbed what `player` used to mean
    // and was renamed for it — it holds YouTube and Spotify as well as
    // Instagram, so "post" described a third of what it does — and `player` is
    // a retro chrome now rather than a frame around somebody else's page.
    const embedding = LEAF_KINDS.filter((kind) => leafFields(kind).embeds);
    expect(embedding).toEqual(["embed"]);
  });

  it("is never claimed by a kind that does not read an address at all", () => {
    expect(
      LEAF_KINDS.filter(
        (kind) => leafFields(kind).embeds && !leafFields(kind).link,
      ),
    ).toEqual([]);
  });

  // Measured rather than asserted from the table: a recognised address really
  // does become a frame on the embedding kinds, and really does not on the
  // ones whose hint says it will not.
  it.each(LEAF_KINDS.filter((kind) => leafFields(kind).link))(
    "frames a recognised address on %s exactly when it claims to",
    (kind) => {
      const drawn = draw({ ...bare(kind), link_url: FRAMEABLE });
      expect(drawn.includes("<iframe")).toBe(leafFields(kind).embeds);
    },
  );
});
