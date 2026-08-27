import type { ReactNode } from "react";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import { themeCss } from "@/features/actors/presentation/theme-css";

/** What {@link ThemeScope} needs. */
export interface ThemeScopeProps {
  /** How the page's owner chose it to look. */
  theme: ActorTheme;
  /** The page. */
  children: ReactNode;
}

/**
 * Applies an owner's theme to everything inside it.
 *
 * A **server component**, and a `<style>` rather than an inline style, because
 * the scheme belongs to the reader: what a visitor sees has to depend on their
 * own light/dark choice, which the server cannot know. `themeCss` emits both
 * renderings as rules and the browser picks — so the owner's colour arrives in
 * the first byte of HTML, with no flash of the wrong accent and no JavaScript.
 *
 * **The visitor's control is never overruled.** This sets only the accent pair
 * and the cloud's tint. Everything that makes a page light or dark stays in
 * `globals.css` under the reader's toggle, so somebody who needs a dark page
 * gets one — wearing the owner's colours rather than instead of them.
 *
 * **It wraps nothing, and what it emits is up to three rules now** — see
 * `themeCss`'s own doc for the account in full. The colours still go to
 * `:root`, because a theme is the whole page: the field the body paints and
 * the canvas mounted in the root layout are both outside any element a page
 * could scope to. An earlier version scoped its rules to a nested `div`,
 * which is exactly why the backdrop colours reached the canvas and the
 * accent reached the editor — neither. The skin and the page's own
 * background picture reach further elements of their own (`SKIN_SCOPE` and
 * `body`, respectively) within the same `<style>` element this component
 * emits, not a second one.
 *
 * A theme that overrides nothing emits no `<style>` element at all, so an
 * unthemed page is byte-for-byte what it was before any of this existed.
 *
 * **The SHAPE it returns never changes, and that is load-bearing wherever the
 * theme is live.** It used to return `children` bare when there was no CSS and
 * a fragment when there was — so the first colour an author picked changed the
 * element type at this position, and React unmounted and remounted the whole
 * subtree. On a public page that can never happen: the theme is resolved once
 * on the server and never moves. In the EDITOR it happens on the first edit,
 * and it took the workbench's state with it — the theme panel closed the
 * instant somebody copied a profile theme or chose a colour, so the next
 * control they reached for was not there.
 *
 * Found by `signed-in.spec.ts` and `atmosphere.spec.ts` timing out on controls
 * that had simply been unmounted, which is worth knowing because the symptom
 * reads as a slow page rather than as a remount. The empty slot is what keeps
 * `children` at a stable index.
 *
 * @returns the page, themed.
 */
export function ThemeScope({ theme, children }: ThemeScopeProps) {
  const css = themeCss(theme);
  return (
    <>
      {/* Either generated or refused first, never stored raw — see themeCss. */}
      {css ? <style>{css}</style> : null}
      {children}
    </>
  );
}
