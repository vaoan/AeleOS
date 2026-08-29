import {
  DEFAULT_THEME,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import type {
  Block,
  ContainerBlock,
} from "@/features/actors/domain/block-schema";
import type { FursonaTemplate } from "@/features/actors/domain/fursona-templates";

// FIVE LOOKS AIMED AT FIVE ERAS OF SOMEBODY ELSE'S OPERATING SYSTEM.
//
// **The second test of reach**, after the eleven social pastiches. Those asked
// whether the block model could be pushed toward somebody else's social
// network; these ask the same of an operating system, and for the same reason:
// a pastiche fails visibly and in a way you can name, where "the editor feels
// limited" is not actionable.
//
// **Arrangement and palette, and the subject's own mark as the AVATAR.** These
// are trademarked visual designs and what is imitated is an era's aesthetic;
// no artwork of anybody's is fetched, embedded or committed here, and the
// avatar a seeded page wears is hot-linked by `scripts/seed-pastiches.mjs`
// rather than living in this repository.
//
// **That is a reversal, made deliberately on 2026-08-29.** These looks used to
// carry no artwork at all, on the argument that an operating system's CHROME
// is the thing being imitated and a logo is no part of it — while the eleven
// social pastiches beside them each wore their subject's mark. The two sets
// took opposite lines and it was written down as a deliberate difference
// rather than settled. It is settled towards consistency now: a page with an
// empty circle where every neighbour has a mark reads as unfinished rather
// than as principled.
//
// **Not one new skin was added for any of them**, which is the finding that
// shaped the whole phase. `retro` already IS Windows 98's raised bevel and
// `aero` already IS Aero glass, so three of the five needed no chrome written;
// adding `win98` or `win7` to `SKINS` would be the "another set of numbers"
// this repository's bar forbids. What a look adds is the PALETTE and the
// arrangement around an existing skin, which is exactly why a look is a
// document rather than a vocabulary member.
//
// **Every one is an OPTION and none is a default.** A page that picks none is
// byte-for-byte what it was.
//
// Each was built from a capture that was fetched and looked at — see the table
// in `docs/superpowers/plans/2026-08-28-era-looks-phase-2-the-five-looks.md`
// for which file each came from. Where the model could not reach the capture,
// the gap is written up in the pastiche findings rather than papered over, and
// Windows 8 is mostly gap: see `WIN8` below.

/**
 * A gradient with every key `parseTheme` expects present.
 *
 * @param angle - the ramp's direction in degrees.
 * @param stops - the colours and where along the ramp each sits.
 * @returns the gradient.
 */
const gradient = (
  angle: number,
  stops: { color: string; at: number }[],
): NonNullable<ActorTheme["background"]> => ({
  kind: "linear",
  repeating: false,
  every: 100,
  angle,
  shape: "ellipse",
  extent: "farthest-corner",
  x: 50,
  y: 50,
  stops,
});

/**
 * A theme built on the design's own, overriding only what a look needs.
 *
 * Spread over {@link DEFAULT_THEME} rather than written out, so a key no look
 * sets keeps meaning exactly what it meant before era looks existed.
 *
 * @param over - what this look changes.
 * @returns the whole theme.
 */
const look = (over: Partial<ActorTheme>): ActorTheme => ({
  ...DEFAULT_THEME,
  ...over,
});

/**
 * One leaf.
 *
 * @param kind - the content kind.
 * @param title - the leaf's own title, required everywhere.
 * @param over - any further fields that kind reads.
 * @returns the leaf.
 */
const leaf = (
  kind: string,
  title: string,
  over: Record<string, unknown> = {},
) => ({ kind, title_en: title, ...over }) as unknown as Block;

/**
 * One named section.
 *
 * @param name - the heading it draws.
 * @param children - what sits in its places.
 * @param over - arrangement and style.
 * @returns the container.
 */
const section = (
  name: string,
  children: (Block | null)[],
  over: Record<string, unknown> = {},
): ContainerBlock =>
  ({
    kind: "container",
    mode: "stack",
    name_en: name,
    spaces: 1,
    children,
    ...over,
  }) as unknown as ContainerBlock;

/**
 * The identity section every look carries.
 *
 * **Built in rather than left to `withRequiredBlocks`.** A look is a document
 * somebody pastes as well as a template somebody picks, and a document naming
 * no `avatar`, `handle` or `owner` is refused outright by
 * `set_actor_sections` — so it has to be in the tree rather than added by a
 * read path the paste never goes through.
 */
const identity = (): ContainerBlock =>
  section("About", [
    // **`contain`, because four of the five era marks are WORDMARKS** — the
    // Windows XP, Vista and 7 lockups are about five times as wide as they are
    // tall, and the avatar leaf is `object-cover` on a circle, so `cover`
    // crops them to two meaningless fragments. That is exactly the fault
    // `image_fit` was added for, found the first time the social pastiches
    // were given their real logos.
    //
    // It reaches somebody who PICKS one of these as a template too, and that
    // is the safer direction rather than a cost: `contain` and `cover` render
    // a square portrait identically, and they differ only on a picture that is
    // not square — where showing the whole of somebody's character beats
    // cropping it.
    leaf("avatar", "Portrait", { style: { image_fit: "contain" } }),
    leaf("handle", "Handle"),
    leaf("owner", "Owner"),
  ]);

/**
 * Windows 98 — the raised bevel, the teal ground, the navy title bars.
 *
 * `retro` carries the chrome exactly: `--skin-round: 0`, a 2px border, a white
 * top-left inset against a black bottom-right one, and a hard offset shadow.
 * What this adds is the palette and the title bars, which is `heading: "bar"`.
 */
const WIN98: FursonaTemplate = {
  id: "era-win98",
  theme: look({
    skin: "retro",
    font: "system",
    background: gradient(180, [
      { color: "#008080", at: 0 },
      { color: "#008080", at: 100 },
    ]),
    accent: "#000080",
    // **Silver panels on a teal ground**, which was unreachable until a page
    // could choose its own. This is the exact pairing that motivated the key.
    surface: "#c0c0c0",
    canvas: "none",
    measure: "wide",
  }),
  blocks: [
    section("My Computer", [leaf("text", "About me")], {
      style: { heading: "bar", radius: "square" },
    }),
    section("Programs", [leaf("text", "What I do")], {
      style: { heading: "bar", radius: "square" },
    }),
    identity(),
  ],
};

/**
 * Windows XP — Luna: blue gradient title strips over pale bodies.
 *
 * `heading: "gradient"` is the task pane's own header almost exactly, and it
 * collapses the gap beneath itself so the body squares up under the strip the
 * way Luna's panels do.
 *
 * **It reaches Luna's panel SHAPE now, which it could not when this was
 * written.** `radius` was one value for four corners, so a soft top brought a
 * soft join with it and the strip could not sit flush on the body; this note
 * recorded that as an open gap rather than inventing a key on the way past.
 * `corners` and `heading_corners` are that key, arrived at from the other end
 * — somebody looking at these pages and naming what was missing.
 *
 * The two sections below are the shape: the bar rounds its top and squares its
 * foot, the body squares its head and rounds its foot, and the join between
 * them is straight. That is a window.
 */
const WINXP: FursonaTemplate = {
  id: "era-winxp",
  theme: look({
    skin: "default",
    font: "system",
    background: gradient(160, [
      { color: "#4e8bd8", at: 0 },
      { color: "#9dc4f0", at: 100 },
    ]),
    accent: "#245edb",
    // Luna's panels are near-white, where a stepped surface gave them the
    // ground's own blue.
    surface: "#f4f7fd",
    // **Bliss, which is the single most recognisable thing about this era**
    // and was missing while the page carried a hand-mixed blue ramp. The
    // gradient stays underneath it: a background picture is a layer over
    // `--field`, so an address that fails to load leaves the ramp rather than
    // a blank page. Hot-linked like every other picture here; nothing is
    // stored.
    backgroundUrl:
      "https://upload.wikimedia.org/wikipedia/en/2/27/Bliss_%28Windows_XP%29.png",
    backgroundFit: "cover",
    canvas: "none",
    measure: "wide",
  }),
  blocks: [
    section("System Tasks", [leaf("link", "Somewhere I am")], {
      style: {
        heading: "gradient",
        radius: "soft",
        heading_corners: "tl,tr",
        corners: "bl,br",
      },
    }),
    section("Other Places", [leaf("text", "What I like")], {
      style: {
        heading: "gradient",
        radius: "soft",
        heading_corners: "tl,tr",
        corners: "bl,br",
      },
    }),
    identity(),
  ],
};

/**
 * Windows Vista — Aero glass, dark-tinted, over a green aurora.
 *
 * `aero` is the mechanism whole: an 8px backdrop blur, a top-half sheen and a
 * surface mixed to 72%. The palette is what makes this Vista rather than 7.
 */
const VISTA: FursonaTemplate = {
  id: "era-vista",
  theme: look({
    skin: "aero",
    background: gradient(150, [
      { color: "#0b3d2e", at: 0 },
      { color: "#12706b", at: 55 },
      { color: "#7fc7a4", at: 100 },
    ]),
    accent: "#1f9ea8",
    canvas: "aurora",
    measure: "wide",
  }),
  blocks: [
    section("Welcome Centre", [leaf("text", "Who I am")], {}),
    section("Gallery", [leaf("picture", "A picture")], {}),
    identity(),
  ],
};

/**
 * Windows 7 — the same Aero glass, light-tinted, over bright blue.
 *
 * **Vista and 7 differ by PALETTE and not by mechanism**, which is a
 * refinement of the spec: it called them near-identical, and the captures show
 * one dark-tinted on green and the other light-tinted on blue. Both are
 * `aero`, which is the clearest evidence in this whole phase that a look is a
 * document rather than a skin.
 */
const WIN7: FursonaTemplate = {
  id: "era-win7",
  theme: look({
    skin: "aero",
    background: gradient(170, [
      { color: "#1c6fc4", at: 0 },
      { color: "#63b6ef", at: 60 },
      { color: "#cfe9fb", at: 100 },
    ]),
    accent: "#2b7fd4",
    canvas: "none",
    measure: "wide",
  }),
  blocks: [
    section("Libraries", [leaf("text", "What I keep")], {}),
    section("Pictures", [leaf("picture", "A picture")], {}),
    identity(),
  ],
};

/**
 * Windows 8 — Metro, as far as this model reaches, which is not all the way.
 *
 * **This one is a FINDING rather than a delivery, and it was predicted before
 * it was built.** Metro's whole signature is flat solid tiles in DIFFERENT
 * colours — the capture holds blue, crimson, green, purple, cyan, olive and
 * orange in one screen — and per-block colour is refused by design here: a
 * skin names no colour of its own, and every pairing of a style and a palette
 * is somebody's page.
 *
 * What IS reachable is everything else, and it is worth knowing how much:
 * `chrome: "bare"` removes the fill, edge, shadow and padding together;
 * `radius: "square"` squares the corners; `spacing: "compact"` closes the gaps
 * to a hairline; and the mixed tile sizes are ordinary `spaces` and `weights`.
 * So the ARRANGEMENT lands and the colour does not, which is the most useful
 * shape a failure can have — it names one mechanism rather than a feeling.
 */
const WIN8: FursonaTemplate = {
  id: "era-win8",
  theme: look({
    skin: "default",
    font: "system",
    spacing: "compact",
    background: gradient(180, [
      { color: "#1d1d1d", at: 0 },
      { color: "#1d1d1d", at: 100 },
    ]),
    accent: "#0072c6",
    // A tile has to be distinguishable from the ground it sits on, and a
    // stepped surface on near-black is barely that. It is still ONE colour
    // where Metro has seven — the gap this look exists to demonstrate.
    surface: "#2d2d2d",
    canvas: "none",
    measure: "full",
  }),
  blocks: [
    section(
      "Start",
      [
        leaf("text", "Me"),
        leaf("text", "Words"),
        leaf("link", "Elsewhere"),
        leaf("picture", "A picture"),
      ],
      {
        mode: "grid",
        spaces: 3,
        weights: [2, 1, 1],
        // **`card` and not `bare`, which the first photograph corrected.**
        // `bare` drops the fill along with the edge, the shadow and the
        // padding — so the tiles vanished and Metro became floating labels on
        // black. A tile is a strong FILL with no border and no corner, which
        // is `card` with `border: "none"` and `radius: "square"`.
        style: {
          chrome: "card",
          border: "none",
          radius: "square",
          text_align: "start",
        },
      },
    ),
    identity(),
  ],
};

/**
 * The five, in the order an author meets them.
 *
 * Oldest first, because that is the order somebody thinks of them in and the
 * only ordering that is not an opinion about which is best.
 */
export const ERA_LOOKS: readonly FursonaTemplate[] = Object.freeze([
  WIN98,
  WINXP,
  VISTA,
  WIN7,
  WIN8,
]);
