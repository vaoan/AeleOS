import type { ReactNode } from "react";
import {
  themeCss,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";

/** What {@link ThemeScope} needs. */
export interface ThemeScopeProps {
  /** How the page's owner chose it to look. */
  theme: ActorTheme;
  /** The page. */
  children: ReactNode;
}

/**
 * The class the emitted rules are scoped to.
 *
 * Fixed rather than generated, because a page carries exactly one theme and a
 * generated name would change on every render — which defeats streaming and
 * gives the browser a new selector to match each time.
 */
const SCOPE = "actor-theme";

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
 * A theme that overrides nothing emits no element at all, so an unthemed page
 * is byte-for-byte what it was before any of this existed.
 *
 * @returns the page, themed.
 */
export function ThemeScope({ theme, children }: ThemeScopeProps) {
  const css = themeCss(theme, SCOPE);
  if (!css) return children;
  return (
    <>
      {/* Generated from numbers, never from a stored string — see themeCss. */}
      <style>{css}</style>
      <div className={SCOPE}>{children}</div>
    </>
  );
}
