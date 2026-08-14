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
 * The canvas and style names are **built by mapping `CANVASES` and `SKINS`**
 * rather than written out. One added to either list then gets a catalogue entry
 * or fails `messages.test.ts`; it can never quietly render its own id at
 * somebody.
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
    },
    accent: t("themeAccent"),
    canvasColours: t("themeCanvasColours"),
    canvas: t("themeCanvas"),
    canvases: Object.fromEntries(
      CANVASES.map((canvas) => [canvas, t(`canvases.${canvas}`)]),
    ) as Record<CanvasId, string>,
    skin: t("themeSkin"),
    skins: Object.fromEntries(
      SKINS.map((skin) => [skin, t(`skins.${skin}`)]),
    ) as Record<SkinId, string>,
    adjusted: t("themeAdjusted"),
    reset: t("themeReset"),
    usingDefault: t("themeUsingDefault"),
    cursor: t("themeCursor"),
    cursorHint: t("themeCursorHint"),
    cursorTooBig: t("themeCursorTooBig"),
  };
}
