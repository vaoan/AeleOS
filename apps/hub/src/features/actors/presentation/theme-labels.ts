import { CANVASES, type CanvasId } from "@/features/actors/domain/actor-theme";
import type { ThemeConfiguratorLabels } from "@/features/actors/presentation/theme-configurator";
import { SKINS, type SkinId } from "@/shared/domain/skins";

/**
 * A translator for one namespace, which is all this needs of next-intl.
 *
 * Taking a function rather than importing `getTranslations` keeps this out of
 * the framework — the layering rules forbid a feature from reaching for one,
 * and it also means the resolver can be tested without a request.
 */
export type Translate = (key: string) => string;

/**
 * Every string the theme panel renders, resolved from the `fursonas` namespace.
 *
 * **One resolver, used by both places the panel appears.** It is on the fursona
 * editor and on `/me`, and those live in different route folders which may not
 * import each other — so without this each would carry its own near-identical
 * copy of eighteen catalogue lookups, and a string added to one would quietly
 * be missing from the other.
 *
 * The namespace is `fursonas` on both, deliberately. A person's profile means
 * exactly what a fursona's page means by "accent" and "backdrop", and the
 * visibility words are already shared the same way for the same reason: a
 * second copy is two catalogues to keep in step for no gain.
 *
 * The three canvas dials are resolved here with the rest, even though the panel
 * hides them for a canvas that draws nothing — which control appears is the
 * panel's decision, and a label bag that varied by canvas would be several
 * shapes to keep in step.
 *
 * It resolves the copy button's label whether or not the caller will render
 * one — the panel decides that from whether a profile theme was handed to it,
 * and a label bag that varied by caller would be two shapes to keep in step.
 *
 * The canvas and style names are **built by mapping `CANVASES` and `SKINS`**
 * rather than written out. One added to either list then gets a catalogue entry
 * or fails `messages.test.ts`; it can never quietly render its own id at
 * somebody.
 *
 * The animation carries a group name and a hint as well as its own field
 * labels. That is a copy decision made visible in the shape: the panel needed a
 * heading that says WHICH background it edits, because three things here were
 * named after the background and in Spanish all three carried the same word.
 *
 * The background's kinds, radial shapes and extents are looked up one key at a
 * time rather than built from the lists in `gradient.ts`. That is what makes a
 * missing translation a build failure — the record's type demands every key —
 * instead of a name resolving to a raw message id on somebody's screen.
 *
 * @param t - a translator bound to the `fursonas` namespace.
 * @returns the labels, ready for the panel.
 */
export function themeConfiguratorLabels(t: Translate): ThemeConfiguratorLabels {
  return {
    title: t("themeTitle"),
    live: t("themeLive"),
    gradient: {
      title: t("gradientTitle"),
      bar: t("gradientBar"),
      colour: t("gradientColour"),
      position: t("gradientPosition"),
      angle: t("gradientAngle"),
      add: t("gradientAdd"),
      remove: t("gradientRemove"),
      kind: t("gradientKind"),
      kinds: {
        linear: t("gradientKindLinear"),
        radial: t("gradientKindRadial"),
        conic: t("gradientKindConic"),
      },
      repeat: t("gradientRepeat"),
      every: t("gradientEvery"),
      shape: t("gradientShape"),
      shapes: {
        ellipse: t("gradientShapeEllipse"),
        circle: t("gradientShapeCircle"),
      },
      extent: t("gradientExtent"),
      extents: {
        "closest-side": t("gradientExtentClosestSide"),
        "closest-corner": t("gradientExtentClosestCorner"),
        "farthest-side": t("gradientExtentFarthestSide"),
        "farthest-corner": t("gradientExtentFarthestCorner"),
      },
      centreX: t("gradientCentreX"),
      centreY: t("gradientCentreY"),
      preview: t("gradientPreview"),
    },
    accent: t("themeAccent"),
    canvasColours: t("themeCanvasColours"),
    canvasGroup: t("themeCanvasGroup"),
    canvasGroupHint: t("themeCanvasGroupHint"),
    canvas: t("themeCanvas"),
    density: t("themeDensity"),
    speed: t("themeSpeed"),
    scale: t("themeScale"),
    canvases: Object.fromEntries(
      CANVASES.map((canvas) => [canvas, t(`canvases.${canvas}`)]),
    ) as Record<CanvasId, string>,
    skin: t("themeSkin"),
    skins: Object.fromEntries(
      SKINS.map((skin) => [skin, t(`skins.${skin}`)]),
    ) as Record<SkinId, string>,
    adjusted: t("themeAdjusted"),
    reset: t("themeReset"),
    copyFromProfile: t("themeCopyFromProfile"),
    usingDefault: t("themeUsingDefault"),
    cursor: t("themeCursor"),
    cursorHint: t("themeCursorHint"),
    cursorTooBig: t("themeCursorTooBig"),
  };
}
