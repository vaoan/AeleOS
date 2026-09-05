"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { EyeOff } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { PageContext } from "@/features/actors/presentation/blocks";
import {
  useController,
  useForm,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormSetValue,
} from "react-hook-form";
import { useRouter } from "@/shared/infrastructure/i18n/navigation";
import { tid } from "@/shared/infrastructure/test-id";
import { useEscapeSlot } from "@/shared/presentation/escape-slot";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { ThemeScope } from "@/features/actors/presentation/theme-scope";
import { PageThemeSwitch } from "@/shared/presentation/page-theme-switch";
import { useFursonaEditor } from "@/features/actors/application/use-fursona-editor";
import type { ChosenPage } from "@/features/actors/domain/fursona-templates";
import { WritingInToggle } from "@/features/actors/presentation/writing-in-toggle";
import { pageInteractionsEnabled } from "@/features/actors/domain/page-interaction";
import { EditorMotion } from "@/features/actors/presentation/editor-motion";
import { AddSlotProvider } from "@/features/actors/presentation/add-slot";
import {
  EditorToolbar,
  type EditorToolbarLabels,
} from "@/features/actors/presentation/editor-toolbar";
import { FormErrorBanner } from "@/features/actors/presentation/form-error-banner";
import {
  BlockEditor,
  type BlockEditorLabels,
} from "@/features/actors/presentation/block-editor";
import { useLanguageToggle } from "@/features/actors/application/use-language-toggle";
import {
  ThemeConfigurator,
  type ThemeConfiguratorLabels,
} from "@/features/actors/presentation/theme-configurator";
import {
  PageSourceDock,
  type PageSourceDockLabels,
} from "@/features/actors/presentation/page-source-dock";
import { usePageSource } from "@/features/actors/application/use-page-source";
import { pageReference } from "@/features/actors/domain/page-reference";
import {
  DEFAULT_THEME,
  themeSchema,
  isCustomised,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import type { Block } from "@/features/actors/domain/block-schema";
import {
  VISIBILITIES,
  fursonaSchema,
  type FursonaInput,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";
import { blocksSchema } from "@/features/actors/domain/block-schema";
import {
  withRequiredBlocks,
  type ActorKind,
} from "@/features/actors/domain/required-blocks";
import {
  blockProblems,
  type BlockProblem,
} from "@/features/actors/domain/block-problems";
import { z } from "zod";

/**
 * Translated strings {@link FursonaEditor} renders.
 *
 * The theme panel's strings are **nested** under `theme` rather than flattened
 * in: both it and the toolbar have a `title`, and a flat bag would have one
 * silently win.
 *
 * `writingIn` is joined by `writingInHint` because the language switch has to
 * name itself and then say what it governs — this editor has an app language
 * and an authoring language, and the switch moves only the second.
 *
 * Extends the toolbar's and the block editor's, because the editor owns one
 * label bag and hands slices of it down rather than each level resolving its
 * own — a component that resolved its own would need the catalogue in the
 * browser.
 *
 * **It carries no `types` record any more.** That was one name per flat
 * layout, and a section is defined by how many places it has across rather
 * than by a layout name; what replaced it is `modes` and `leafKinds`, both
 * built by mapping the vocabulary in `pages/labels.ts` so a name nobody wrote
 * fails the build rather than rendering its own id at somebody.
 *
 * `pageStyle` names the switch that takes the page's own look off while
 * building. It is deliberately not the visitor's string for the same control:
 * "this author's colours" is the wrong way to say it to the author.
 *
 * `source`, the page-source dock's own bag, is inherited through neither
 * extends clause — `EditorToolbarLabels` carries only `openSource`, the flat
 * control that opens the dock, and `PageSourceDockLabels` is declared here as
 * its own field for the same nesting reason `theme` is.
 */
export interface FursonaEditorLabels
  extends EditorToolbarLabels, BlockEditorLabels {
  /** The theme panel's own strings, nested to avoid a `title` collision. */
  theme: ThemeConfiguratorLabels;
  /**
   * The page-source dock's own strings, nested for the same reason `theme`
   * is: both it and this bag have a `title`, and a flat bag would have one
   * silently win.
   */
  source: PageSourceDockLabels;
  /**
   * Names the switch that takes the page's own look off while building.
   *
   * It is the aria-label and the tooltip of an icon toggle, so it names the
   * THING being worn rather than the action — the pressed state says whether
   * it is on. The visitor's copy of the same control on a public page uses a
   * string of its own, because "this author's colours" is the wrong way to say
   * it to the author.
   */
  pageStyle: string;
  /** Names the control that switches which language is being written. */
  writingIn: string;
  /** Says which fields the language switch governs. */
  writingInHint: string;
  /** Shown in the toolbar: what is being edited. */
  title: string;
  /** Field labels. */
  handle: string;
  /** Guidance under the handle field. */
  handleHint: string;
  /** Field label. */
  displayName: string;
  /** Field label. */
  avatarUrl: string;
  /** Field label. */
  visibilityLabel: string;
  /** The error banner's heading. */
  bannerTitle: string;
  /** One label per visibility value. */
  visibility: Record<Visibility, string>;
  /** One message per error code, keyed by code. */
  errors: Record<string, string>;
}

/**
 * What {@link FursonaEditor} needs.
 *
 * **Its `select` is painted with `--menu`, not left transparent.** A dropdown's
 * list is drawn from the control's own background, so a transparent one has
 * nothing to paint with and the browser paints it on white — near-white text on
 * white in dark mode. `dropdown-legibility.test.ts` guards every select in the
 * app against going back.
 *
 * `kind` is what makes this the PERSON's editor as well as a fursona's. It
 * hides the handle field, relaxes the schema that validates it, and sends the
 * fields through `update_my_profile` instead — nothing else differs, because a
 * person's public page is a page like any other.
 *
 * `profileTheme` is genuinely optional: it feeds the panel's "use my profile's
 * look", which renders only where there is something to copy, so a caller that
 * omits it simply offers no button.
 *
 * `initialSections` and `initialTheme` are **not optional in practice**, even
 * though the types allow their absence for the create page. `set_actor_sections`
 * replaces rather than merges, so an edit that opened without them deleted
 * everything the owner had written the moment they saved.
 *
 * `initialSections` is separate from `initial` because the two come from
 * different reads: the fields from `my_actors()`, the sections from
 * `actor_profiles`. `0009` deliberately did not join them.
 *
 * **A `null` there is not an absent one**, and the difference is what stops
 * this editor erasing a page it cannot read — see the prop.
 *
 * `page` is required rather than optional, unlike everything else here: every
 * section previews itself with the real renderer, and a preview handed nothing
 * would degrade a Twitch player to a link without saying so. It is the same
 * `PageContext` the public pages thread — one object rather than one prop per
 * page-level value — and the routes build it from `env.hubHost`.
 */
export interface FursonaEditorProps {
  /** Already-translated strings. */
  labels: FursonaEditorLabels;
  /** Existing values when editing; absent when creating. */
  initial?: Partial<FursonaInput>;
  /**
   * The fursona's existing sections, absent when creating.
   *
   * **`null` is a third state and is not the same as absent.** It means a page
   * IS stored and `readActorPage` could read it as NEITHER shape — so the form
   * opens with nothing, exactly as it would for a new page, and the SAVE is
   * refused rather than allowed to write that nothing over the page. See
   * {@link ActorPage.sections} and `useFursonaEditor`'s `pageIsReadable`.
   */
  initialSections?: Block[] | null;
  /** How the page already looks, absent when creating. */
  initialTheme?: ActorTheme;
  /**
   * The person's own profile theme, offered as a starting point.
   *
   * Optional because the panel only offers the copy where there is something
   * to copy — a profile nobody has themed, or a caller that did not read one,
   * simply renders no button.
   */
  profileTheme?: ActorTheme;
  /** The fursona being edited, absent when creating. */
  actorRef?: string;
  /** False when editing — the handle is then shown but not submitted. */
  handleEditable: boolean;
  /**
   * Whether the actor is the person themselves.
   *
   * A person's handle is the provisioned `u-<actor_ref>`: nobody chooses it, it
   * appears in no address, and it is the string this app stopped displaying
   * anywhere. So the field is not shown rather than shown-and-locked — a
   * disabled input invites somebody to wonder how to unlock it.
   */
  kind?: "fursona" | "person";
  /**
   * This deployment's own hostname, threaded to every section's live preview.
   *
   * The preview is the REAL renderer, and one leaf kind reads this: Twitch's
   * player refuses to load unless `parent=` names the embedding domain. An
   * empty value degrades a Twitch embed to a link in the preview, which is
   * what a page rendered without it would show as well — so it is resolved by
   * the route, exactly as both public pages resolve it.
   */
  page: PageContext;
}

/** Where a save or a cancel returns to. */
const LIST = "/pages";

/**
 * The whole editor's shape: the four fields, plus the page's blocks.
 *
 * Composed from the schemas rather than restated, so neither the field rules
 * nor the block rules exist twice. `blocksSchema` is the STRICT side of the
 * write/read split — an unknown key is a typo somebody just made and is
 * refused rather than dropped, and an untitled leaf is refused too, because a
 * block is a heading with something under it. `block-limits-match-migration`
 * pins its caps to `0009`.
 *
 * **Nothing names the form's own value type any more, deliberately.**
 * `blocksSchema` is a `z.ZodType<Block[], unknown>` — the recursion it is built
 * from cannot be inferred — so what `useForm` derives from the resolver and
 * what `z.infer` derives from the schema disagree about `sections`, and a
 * hand-written alias for either is a second answer to a question the form
 * already answers. Every component below is generic over `FieldValues` and
 * names its own field by path, which is what `BlockEditor` needs regardless.
 */

const editorSchema = fursonaSchema.extend({
  sections: blocksSchema,
  theme: themeSchema,
});

/**
 * The same form, for a person, whose handle is not theirs to choose.
 *
 * **A person could not save at all without this**, and the reason is worth
 * keeping: their handle is the provisioned `u-<actor_ref>`, which is 34
 * characters, and `fursonaSchema` caps a handle at 32. So the resolver refused
 * a form whose offending field is not even rendered — no message appeared
 * anywhere, because there is no input to attach one to, and Save simply did
 * nothing.
 *
 * The handle is kept in the values rather than dropped, because the draft type
 * is shared and nothing downstream sends it: `updateMyProfile` derives its
 * target from the token and reads three fields, none of them this one.
 */
const personEditorSchema = editorSchema.extend({ handle: z.string() });

/**
 * Which sentence a refused page gets, of the three the `sections` field owns.
 *
 * **A banner must never promise a marking nothing made, and it must not name
 * the wrong cause either.** A page-level refusal — too many blocks, too many
 * bytes — carries no index, so there is nothing to mark and the banner says
 * something else entirely. A refusal that landed on a block IS marked, by
 * `LeafEditor` or by `BlockCard`, so the banner can say so; but the sentence
 * that names a missing title is only true when every refusal is a missing
 * title, which stopped being the common case the moment a container's own
 * fields could be refused. Naming a cause that is not the cause sends somebody
 * looking at a field that is fine.
 *
 * @param problems - what the save refused, and where.
 * @returns the catalogue key for the banner.
 */
function sectionsCode(problems: readonly BlockProblem[]): string {
  if (problems.length === 0) return "sectionsTooLarge";
  return problems.every((problem) => problem.field.startsWith("title_"))
    ? "sections"
    : "sectionsMarked";
}

/**
 * The fursona editor: a full-page form under a sticky toolbar.
 *
 * Replaces `FursonaForm` and the server actions behind it. react-hook-form
 * rather than `useActionState`, because the page is a live value a server
 * action cannot drive — first through `useFieldArray`, and now through one
 * controlled field holding the whole tree.
 *
 * Validation reuses `fursonaSchema` through `zodResolver` rather than
 * restating the rules. `fursona-schema.test.ts` already pins them, and a second
 * copy would drift from the one the database enforces.
 *
 * It now edits the page as well as the fursona: the four fields, a language
 * toggle, and the blocks. Its schema is `fursonaSchema` extended with
 * `blocksSchema`, composed rather than restated so neither set of rules exists
 * twice.
 *
 * **The language switch is a control in the toolbar (2026-08-28), and the
 * strip it used to be is gone.** That strip sat between the theme panel and
 * the sections, sticky at its own `--bar-top-2`, and the reasoning for the
 * position was sound: `lang` reaches only `BlockEditor` — `fursonaSchema` has
 * no `_en`/`_es` field at all — so a strip anywhere higher announced itself
 * over the four top fields it does not touch.
 *
 * **That objection is real and was accepted rather than argued away.** The
 * switch now sits above every one of those fields, and what buys it is that a
 * control in the bar is a control rather than an announcement: it is 67px of
 * segmented switch beside the title, not a full-width card with a heading and
 * a hint sentence, so there is nothing left to read as a statement about the
 * fields under it. What the hint said survives as the switch's own `title`
 * and its group `aria-label`, which is also what tells it apart from the
 * app's own language button in the header directly above.
 *
 * `--bar-top-2` went with the strip; it had exactly one consumer. Anything
 * still naming a third bar or a `short:static` offset for one is describing
 * an arrangement this editor no longer has.
 *
 * **The control that brings the workbench back sets `--chrome-text`**, and
 * that is a cascade fact rather than a style choice. `.aeleos-chrome` resets
 * `font-size` so an author's `spacing` cannot resize the workbench, and those
 * declarations are unlayered — so a bare reset would beat this button's own
 * `text-sm` and render it at 16px instead of 14px. The rule reads
 * `var(--chrome-text, 1rem)`, so an island asking for another size sets that
 * token rather than trying to outrank a rule it cannot. See `globals.css` and
 * `controls-stay-stable.spec.ts`.
 *
 * **It hands `BlockEditor` the live theme, which that component asks about
 * rather than paints with.** The picker lives down there and the palette lives
 * here, so a predicate about the whole page needs both halves in one place.
 *
 * **A picked template and a pasted document take the same path.** Both end at
 * `applyDocumentTo`, which writes the page and — only when there is one — the
 * look. That sharing is a function rather than a convention: two
 * implementations would have looked identical the day they were written and
 * disagreed the first time either changed, about something destructive.
 *
 * **Navigation is decided by what `save` returns, never by reading
 * `fieldErrors` afterwards.** That value is captured from the render that built
 * the submit handler, so it is still empty when a save fails — and this editor
 * once navigated away on a refusal, hiding the reason and discarding what
 * somebody had typed.
 *
 *
 * Two error sources meet in one banner: what the schema rejected before
 * anything was sent, and what the database refused afterwards. Both are codes,
 * both look up in `labels.errors`, and the person does not need to know which
 * came from where.
 *
 * **The form no longer carries a scope class of its own.** It did, and that
 * class was what made the live preview visible at all after the preview shipped
 * scoped to a selector nothing in the tree wore — colours changed, the
 * stylesheet updated, and the page did not move. The colours then moved to
 * `:root`, which left the class matched by nothing; a skin needs a boundary
 * again, and that boundary is `SKIN_SCOPE` on `PageShell`'s content element,
 * which this form renders inside. A second copy here would be exactly the
 * drift the original fault was made of.
 *
 * **It edits a person too.** `kind="person"` drops the handle field, because
 * theirs is the provisioned `u-<actor_ref>` that appears in no address — and
 * relaxes the schema for it, because that handle is 34 characters against a cap
 * of 32, so the resolver used to refuse the form on a field nothing renders. No
 * message could appear, and Save did nothing at all.
 *
 * **Cancel is a link, not a push.** The toolbar takes an href, so leaving the
 * editor raises the loading bar exactly as any other navigation does — a
 * `router.push` from a button is invisible to it, and cancelling used to change
 * the route with nothing on screen saying anything was happening.
 *
 * **The theme panel is handed the person's profile theme**, which is what lets
 * it offer "use my profile's look". The editor does not decide whether that
 * button appears — the panel does, from whether there is anything to copy — so
 * passing it unconditionally is correct rather than lazy.
 *
 * **A page it could not read opens empty and refuses to save.** That is not
 * two behaviours: `blocksSchema` parses an array and the form has to open on
 * one, so the refusal has to live at the save — which is the only place that
 * can still tell "nothing written" from "could not be read". See
 * `initialSections`.
 *
 * **The theme panel sits above the language strip and the sections**, because
 * it governs how the page previews look, and it is collapsed until somebody
 * opens it — theming is a thing people do once and then leave alone, so an
 * open colour panel would push everything below it down the page for everybody
 * who never touches it. Its changes are previewed locally and written with the
 * rest of the form: what has to be instant is SEEING a colour, not storing it.
 *
 * **The language switch shows both languages rather than the current one.** It
 * was a single button reading "EN", which is ambiguous in the way that matters:
 * a person cannot tell whether the label reports where they are or offers where
 * they could go. Both sides are on screen now, each naming itself in its own
 * language — an endonym is deliberately not translated, because a picker whose
 * options rename themselves is unreadable to whoever needs it — and the switch
 * sticks to the top, since it governs the sections further down the page than
 * it sits.
 *
 * **The visibility `select` is painted with `--menu`, not left transparent.** A
 * dropdown's list is drawn from the control's own background, so a transparent
 * one has nothing to paint with and the browser paints it on white — near-white
 * text on white in dark mode. `dropdown-legibility.test.ts` guards every select
 * in the app against going back.
 *
 * Exposes the `editor-handle`, `editor-display-name`, `editor-visibility`,
 * `writing-in-en` and `writing-in-es`
 * test ids. They exist because a signed-in end-to-end test can reach this page
 * at last; the fields are addressed by test id rather than by label because a
 * label is translated and the suite runs in Spanish.
 *
 * **`BlockEditor` gets `control` alone**, where the flat editor needed
 * `register` and `setValue` as well. The whole page is one form field there —
 * forced, because a place may hold nothing and `useFieldArray` cannot key an
 * entry that is `null` — so every edit is a pure function over the tree handed
 * back through one `onChange`. There is no `sort_order` left to renumber
 * either: the array IS the order, at every depth.
 *
 * **Workbench surfaces use stable AeleOS tokens.** Every control is an island
 * wearing `CHROME_SCOPE`, which re-declares those tokens on the island itself
 * — the cascade compares declarations on the same element, so an island always
 * beats what `:root` is carrying. Workbench groups that hold bare text paint an
 * opaque AeleOS solid beneath themselves — the toolbar and the language strip
 * take `--menu`, which is opaque in both modes, rather than the 35%-alpha
 * `--bar-solid` they wore while the app's own field was behind them. That is a
 * GUARANTEE rather than a measurement: what is behind a control is a colour the author chose, they may
 * choose any colour, and no measurement can give a translucent control contrast
 * against a colour somebody else picks. The page remains visible in the spaces
 * between groups and inside
 * preview hosts.
 *
 * **Every one of those groups is a card, and the identity fields were the
 * exception.** They carried the backing with none of the chrome, so against an
 * author's field they read as a bare rectangle among rounded, bordered
 * siblings — the theme panel, the language toggle and each section below.
 * Adding the shape is presentation only: the opaque token is the same one the
 * contrast guard measures, so the legibility guarantee is untouched.
 *
 * **A refused page gets one of three sentences, not one of two** — see
 * {@link sectionsCode}. The middle one exists because a refusal on a
 * container's own field is marked now, so the banner may say a marking was
 * made, but naming the missing English title would be naming a cause that is
 * not the cause.
 *
 * `page` is overlaid with the live identity and measure, then threaded to every
 * section tray — see {@link FursonaEditorProps}.
 *
 * **The block editor previews from the LIVE form, not from the saved page.**
 * Identity leaves render out of the page context, so handing down the one the
 * route resolved would show somebody the portrait and handle they had before
 * they started editing — a preview quietly disagreeing with the form directly
 * above it. Three fields are overlaid from `useWatch`; the rest of the context
 * is the route's, because an address is assigned rather than typed and a
 * fursona's owner is not something its editor can change.
 *
 * **The live theme goes to the DOCUMENT.** `ThemeScope` takes the form's
 * unsaved theme, so `:root` carries the author's palette, `body` paints their
 * field and background picture, and the root layout's canvas is theirs — which
 * is the only place any of those can be judged, since a canvas fixed to the
 * viewport cannot be put behind a box. The controls keep the AeleOS workbench
 * palette because each is an island, not because the theme is contained.
 *
 * **There is no whole-page preview component any more.** It was an iframe of a
 * real route, deleted on 2026-08-27: a preview needs a document of its own only
 * while the editor's document belongs to the app, and this editor themes its
 * own `:root` with the draft. The page being built is the document it is being
 * built on, so the section trays are the whole of the preview and hiding the
 * controls is what shows the page.
 *
 * **A page being CREATED opens with its required blocks**, the same
 * `withRequiredBlocks` output `readActorPage` answers for an actor with
 * nothing stored. The create page has no actor to read, so it fell through to
 * an empty tree — which `set_actor_sections` refuses, making a fursona built
 * by hand impossible to save at all.
 *
 * **The workbench can step aside.** One attribute on the element wrapping the
 * editor arms two rules in `globals.css`: one removes every `CHROME_SCOPE`
 * island, the other flattens this editor's own stacking so the sections close
 * up to the spacing `pageBoxClass` gives them on a public page. Nothing
 * persists the choice — it is a way of looking, not a preference. The control
 * that brings the workbench back is rendered OUTSIDE the armed element, or the
 * rule would hide the only way out of the state it created. Hiding controls
 * also invalidates the Properties panel's selection in the same event, so Show
 * controls cannot resurrect a paused panel. While controls show, the form is bounded
 * below the app header and only the canvas scrolls.
 *
 * **Both sticky bars are direct children of the element carrying
 * `data-controls`**, which spans the whole editor, and each puts a
 * `WidePageColumn` inside itself rather than sitting in one. A sticky element
 * sticks only within its parent's box, and the control column ends before the
 * section previews — which own the page's full width and cannot be inside it.
 *
 * **A column meaning "no vertical padding" says `py-0 sm:py-0`.**
 * `COLUMN.wide` is `py-6 sm:py-10`, and tailwind-merge treats a responsive
 * variant as its own group — a bare `py-0` overrides the base and leaves the
 * `sm:` one standing, which is 40px nobody asked for at every width above
 * `sm`. That spelling lives in `FormErrorBanner` now, and the banner itself
 * is handed to `BlockEditor` rather than rendered here (2026-09-03): a
 * column at this level reserved 40px of the author's backdrop on every form
 * with nothing wrong, and a banner at this level sat outside the Properties
 * panel's accommodation padding and was covered by it.
 *
 * **The way out of the author's own look is in the bar.** Since the document
 * wears the draft, a busy theme is worn by the workbench too; the editor hands
 * `EditorToolbar` a `PageThemeSwitch` — the same control a visitor gets — gated
 * on `isCustomised(liveTheme)`, so it arrives with the first colour somebody
 * picks and leaves when they reset. It needed no mechanism of its own:
 * `setPageTheme` writes an attribute and persists nothing, and every rule
 * `themeCss` emits is already gated on it.
 *
 * **The way back to the CONTROLS is portalled into the app header's own
 * control row**, through `useEscapeSlot`. That header is outside the armed
 * element, which is what the escape hatch requires; the editor's own toolbar
 * is inside it and therefore forbidden. It was `fixed` to a corner twice and
 * both were wrong — bottom right covered the page's foot, top right covered
 * the language and light/dark toggles by 88% each. A control out of flow has
 * no way to know what it lands on.
 *
 * **It mounts the page-source dock through `PageSourceField`, a component of
 * its own rather than a `usePageSource` call inline here.** `BlockEditor`
 * already keeps this component from re-rendering on every keystroke inside a
 * block by holding its own `useController({ control, name: "sections" })`
 * rather than being handed the tree as a prop; `PageSourceField` does the
 * same for the dock's `blocks`, with its own `useWatch`. Watching `sections`
 * here directly — which an earlier version of this wiring did — reaches
 * every ancestor down to `EditorToolbar` on every keystroke in a leaf's own
 * text, which `fursona-editor.test.tsx`'s toolbar-render-count case exists
 * to catch. `PageSourceField` is rendered INSIDE the `data-controls`
 * element, as a sibling of `EditorToolbar`, so it is one more `CHROME_SCOPE`
 * island the hide-controls rule removes — see the note above about
 * everything that rule reaches.
 *
 * **`PageSourceField` does not exist in the tree until `sourceMounted` is
 * set, on the FIRST press of the toolbar control — never merely on
 * `sourceOpen`.** Its `useWatch({ control, name: "sections" })` would
 * otherwise fire `usePageSource`'s `[theme, blocks]` effect, a full
 * `toDocument` serialisation of the whole page, on every keystroke in the
 * editor for every author who never opens the dock at all. Once mounted it
 * stays mounted regardless of `sourceOpen`, so closing the dock keeps the
 * text and problems it was showing rather than throwing them away.
 *
 * **Identity and theme are handed to `BlockEditor` as page Options.** This is
 * a presentation move only: the same registered fields and
 * `ThemeConfigurator` stay mounted, while `BlockEditor` owns inspector
 * selection beside the section field it already controlled.
 *
 * **It owns the session-only Interact-with-page state too (2026-09-02)**,
 * beside `controlsHidden`, and computes the effective rule the two combine
 * through — see `domain/page-interaction.ts`. Showing controls always resets
 * the explicit switch back off; hiding them does not touch it, because
 * Preview already implies interaction through `controlsHidden` alone.
 *
 * **It also mounts `EditorMotion` once, wrapping the whole returned tree**
 * (2026-09-02) — safe because `LazyMotion`/`MotionConfig` render no DOM of
 * their own, so wrapping here adds no element and changes nothing about the
 * canvas's layout or the `DndContext` beneath it. See `editor-motion.tsx`.
 *
 * **It wraps the whole `data-controls` element in `AddSlotProvider`
 * (2026-09-04),** the compact builder menu's single global Add. `BlockEditor`
 * alone owns `blocks`/`selection`, so it computes `addTargetFor`'s result
 * itself and portals one `AddBlockPicker` into the host `AddSlotTarget`
 * renders inside `EditorToolbar` — the same context-and-portal shape
 * `useEscapeSlot` already uses for the "show controls" button, scoped to
 * this feature rather than shared with it. See `add-slot.tsx` and the actors
 * feature note for why a prop threaded down from here would reintroduce the
 * toolbar-render-count fault this file already guards against.
 *
 * @returns the editor.
 */
export function FursonaEditor({
  labels,
  initial,
  initialSections,
  initialTheme,
  profileTheme,
  actorRef,
  handleEditable,
  kind = "fursona",
  page,
}: FursonaEditorProps) {
  const router = useRouter();
  // `null` means a page is stored and this build could read it as neither
  // shape. The form still opens on `[]` below, because that is what the field
  // holds — so the refusal has to live at the SAVE, which is the only place
  // that can tell the two apart.
  const { save, saving, fieldErrors } = useFursonaEditor(
    actorRef,
    kind,
    initialSections !== null,
  );
  const { lang, select } = useLanguageToggle();
  // **A way of LOOKING, not a preference, so nothing persists it.** Somebody
  // steps the workbench out of the way to see their page and steps it back; a
  // remembered value would open the editor with no controls at all for whoever
  // did that once.
  const [controlsHidden, setControlsHidden] = useState(false);
  // **A command version, not selection lifted into this component.**
  // `BlockEditor` still owns the selected value and every way it changes.
  // Incrementing here in the same event that enters Preview invalidates that
  // local value without an effect-driven state update or a remount.
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  // **The session-only interaction switch, and it is not a preference
  // either.** Default off: the canvas is locked so a click selects a block
  // rather than following a link. Pressing the toolbar switch turns it on
  // WHILE CONTROLS STAY VISIBLE; showing controls again always resets it,
  // which is why every place that turns controls back on also clears this —
  // see `onShowControls` below and `pageInteractionsEnabled`, the pure rule
  // the two combine through.
  const [interactEnabled, setInteractEnabled] = useState(false);
  const interactionsEnabled = pageInteractionsEnabled({
    controlsHidden,
    switchEnabled: interactEnabled,
  });
  // **A way of LOOKING, not a preference either.** The dock is closed by
  // default and nothing persists whether it was open — opening it is
  // something somebody does to check or edit the raw page, not a standing
  // choice about how the editor should behave next time.
  const [sourceOpen, setSourceOpen] = useState(false);
  // **Gates whether `PageSourceField` — and the `usePageSource` hook inside
  // it — exists in the tree AT ALL.** `PageSourceDock`'s own `<dialog>`
  // has to stay mounted once it exists so its effect always has a node to
  // call `show()`/`close()` on; but nothing forces it to exist BEFORE
  // anybody has ever opened it. Without this, `PageSourceField`'s
  // `useWatch({ control, name: "sections" })` would fire `usePageSource`'s
  // `[theme, blocks]` effect — a full `toDocument` serialisation of up to
  // 500 blocks — on every keystroke in the editor, for every author who
  // never once opens the dock. Set true the first time `sourceOpen` is
  // asked to become true, and never reset, so closing the dock does not
  // tear down the text and problems it was showing.
  const [sourceMounted, setSourceMounted] = useState(false);
  // **Read from the shell rather than looked up.** The slot is in the header,
  // which this component does not own; a `document.querySelector` for it would
  // be an untyped string contract between two components and is restricted in
  // this app for that reason. Null until the header mounts, which is long
  // before anybody can press Hide controls.
  const escapeSlot = useEscapeSlot();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(
      kind === "person" ? personEditorSchema : editorSchema,
    ),
    defaultValues: {
      handle: initial?.handle ?? "",
      displayName: initial?.displayName ?? "",
      avatarUrl: initial?.avatarUrl ?? "",
      visibility: initial?.visibility ?? "private",
      // **A page being CREATED starts with its required blocks, not empty.**
      // `readActorPage` already answers `withRequiredBlocks([], kind)` for an
      // actor with nothing stored; the create page has no actor to read yet,
      // so it reached this default instead — and an empty tree is one
      // `set_actor_sections` and the save boundary both refuse, for missing
      // `avatar`, `handle` and `owner`. The effect was that a fursona built by
      // hand could not be saved AT ALL: the banner said the sections were
      // refused, over a page whose author had done nothing wrong. Applying a
      // template happened to work, because the template path runs the shim.
      sections: initialSections ?? withRequiredBlocks([], kind),
      theme: initialTheme ?? DEFAULT_THEME,
    },
  });

  // **Where each refused block sits, so the editor can mark it.** The banner
  // used to be the only thing a refused page produced, and it said "fix what
  // is marked" while nothing was marked — over the commonest path there is,
  // since a new piece of content starts untitled and the write schema requires
  // a heading. These are threaded down to the block that is actually wrong.
  const problems = blockProblems(errors.sections);

  // **What the identity leaves preview from, taken from the form rather than
  // from the route.** Every section previews with the real renderer, so an
  // `avatar` or `name` block draws from the page context — and the context the
  // route built holds what was SAVED. Watching the three fields keeps the
  // preview honest while somebody is still typing them.
  //
  // The rest of the context is the route's and is not watchable here: an
  // address is assigned rather than typed, and a fursona's owner is not
  // something its editor can change.
  const [liveHandle, liveName, liveAvatar, liveTheme] = useWatch({
    control,
    name: ["handle", "displayName", "avatarUrl", "theme"],
  });
  const livePage: PageContext = {
    ...page,
    handle: liveHandle || page.handle,
    displayName: liveName || null,
    avatarUrl: liveAvatar || null,
    measure: (liveTheme as ActorTheme).measure ?? null,
  };

  // The reference document names no page-specific value — it is generated
  // wholly from the vocabulary constants for this actor kind — so it is
  // memoised on `kind` alone rather than recomputed on every render.
  const reference = useMemo(() => pageReference(kind), [kind]);

  // Schema failures carry a zod code; the database's refusals carry ours. The
  // banner reads both the same way, so this only has to flatten them.
  //
  // **`sections` is the one that splits three ways**, because the refusals it
  // covers want different sentences — see {@link sectionsCode}.
  const schemaErrors = Object.fromEntries(
    Object.entries(errors).map(([field]) => [
      field,
      field === "sections" ? sectionsCode(problems) : field,
    ]),
  );

  return (
    // **`EditorMotion` wraps the whole tree, once, at the editor's own
    // root — and that is safe precisely because it renders no DOM of its
    // own.** `LazyMotion` and `MotionConfig` are both pure context
    // providers; wrapping here adds zero elements, so it changes nothing
    // about the canvas's layout, the `DndContext` beneath it, or the public
    // page's own boxes. What the boundary actually forbids — an `m.*`
    // component as a `@dnd-kit` node or a `SKIN_SCOPE` descendant — is a
    // rule about which COMPONENTS use `m`, not about where this provider
    // sits; see `editor-motion.tsx` for the enforcement.
    <EditorMotion>
      <form
        {...tid("editor-content")}
        className={
          controlsHidden
            ? ""
            : "flex h-[calc(100dvh-var(--bar-h))] min-h-0 flex-col overflow-hidden"
        }
        onSubmit={handleSubmit(async (values) => {
          // The RETURN VALUE decides, never `fieldErrors`. That variable is
          // captured from the render that built this handler, so it is still
          // empty when the save fails — and the editor used to navigate away on
          // a refusal, hiding the reason and taking the person's typing with it.
          if (await save(values)) router.push(LIST);
        })}
      >
        {/* **The DOCUMENT wears the page being built.** The same component a
          public route uses, handed the live draft rather than a stored theme —
          so `:root` carries the author's palette, `body` paints their field and
          background picture, and the canvas mounted in the root layout is
          theirs. That is what makes a section preview sit on the backdrop it
          will sit on, and it is why there is no framed preview any more.

          Every control is an island inside it wearing `CHROME_SCOPE`, which
          re-declares AeleOS's own tokens on itself. See `shared/domain/chrome.ts`
          for why that needs no cascade fight, and `section-card-face.spec.ts`
          for the guard. */}
        <ThemeScope theme={liveTheme as ActorTheme}>
          {/* **Everything the hide-controls rule reaches.** One CSS rule removes
            every `CHROME_SCOPE` island beneath this attribute, which is why
            hiding is by CLASS rather than by a list of components somebody has
            to keep in step — a control added tomorrow is hidden without anybody
            remembering. A second rule flattens the editor's own stacking, so
            the sections close up to exactly the spacing `pageBoxClass` gives
            them on a public page. */}
          {/* **`AddSlotProvider` wraps both bars, and nothing outside them.**
              `EditorToolbar` renders the empty slot; `BlockEditor` — the only
              component here that owns `blocks` and the current selection —
              portals its own `AddBlockPicker` into it. Neither the provider
              nor the slot renders any DOM of its own, so wrapping this div is
              the same as wrapping only its children. See `add-slot.tsx`. */}
          <AddSlotProvider>
            <div
              data-controls={controlsHidden ? "hidden" : "shown"}
              className={controlsHidden ? "" : "flex min-h-0 flex-1 flex-col"}
            >
              {/* **Both sticky bars are direct children of THIS box**, which spans
              the whole editor. A sticky element sticks only within its parent's
              box, and the control column below stops before the section
              previews — so a bar inside it comes unstuck a few hundred pixels
              down. See `editor-bars-stay-pinned.spec.ts`. */}
              <EditorToolbar
                title={labels.title}
                labels={labels}
                saving={saving}
                cancelHref={LIST}
                onHideControls={() => {
                  setSelectionResetKey((current) => current + 1);
                  setControlsHidden(true);
                }}
                onOpenSource={() => {
                  setSourceMounted(true);
                  setSourceOpen(true);
                }}
                interactEnabled={interactEnabled}
                onInteractEnabledChange={setInteractEnabled}
                // **Gated on the LIVE theme, so it arrives with the first colour
                // somebody picks and leaves when they reset.** Computed here rather
                // than in the bar for the same reason the public routes compute it:
                // the bar owns no domain concept, and `isCustomised` is one.
                pageThemeSwitch={
                  isCustomised(liveTheme as ActorTheme) ? (
                    <PageThemeSwitch labels={{ author: labels.pageStyle }} />
                  ) : null
                }
                // **The switch that used to be a strip above the sections.** It is
                // handed in as a node for the reason `pageThemeSwitch` is: the bar
                // owns no domain concept, and which languages somebody may author
                // in is one.
                writingIn={
                  <WritingInToggle
                    lang={lang}
                    onSelect={select}
                    labels={{
                      writingIn: labels.writingIn,
                      writingInHint: labels.writingInHint,
                    }}
                  />
                }
              />

              {/* **Its own `sections` watch, isolated in its own component so it
              stays out of THIS render.** `BlockEditor` already keeps this
              component from re-rendering on every keystroke inside a block
              by holding its own `useController({ control, name: "sections"
              })` — the subscription lives in the CHILD, so a change to
              `sections` re-renders `BlockEditor` and nothing above it.
              `PageSourceField` does the same for the dock: watching
              `sections` directly here would reach every ancestor down to
              `EditorToolbar` on every keystroke in a leaf's own text, which
              `fursona-editor.test.tsx`'s toolbar-render-count case is what
              caught when an earlier version of this wiring watched it at
              this level instead.

              **Gated on `sourceMounted`, not merely on `open`.** Before
              anybody presses the toolbar control, `PageSourceField` does not
              exist in the tree at all — so `usePageSource`'s `[theme,
              blocks]` effect, a full `toDocument` serialisation of the whole
              page, never runs for an author who never opens the dock. Once
              mounted it stays mounted regardless of `open`, so closing the
              dock does not throw away the text or the problems it was
              showing. */}
              {sourceMounted && (
                <PageSourceField
                  control={control}
                  setValue={setValue}
                  theme={liveTheme as ActorTheme}
                  actorKind={kind}
                  open={sourceOpen}
                  onClose={() => setSourceOpen(false)}
                  reference={reference}
                  labels={labels.source}
                />
              )}

              <BlockEditor
                control={control}
                lang={lang}
                labels={labels}
                onApplyDocument={(chosen) => applyDocumentTo(setValue, chosen)}
                theme={liveTheme as ActorTheme}
                page={livePage}
                problems={problems}
                pageInteractionsEnabled={interactionsEnabled}
                controlsHidden={controlsHidden}
                selectionResetKey={selectionResetKey}
                // **Handed DOWN rather than rendered here, and it carries its
                // own page column.** Both are the same lesson from the same
                // day: a banner rendered at this level sat outside the
                // inspector's accommodation padding and was covered by the
                // panel, and a column rendered at this level reserved 40px of
                // the author's backdrop on every form with nothing wrong. See
                // `BlockEditorProps.banner` and `FormErrorBanner`.
                banner={
                  <FormErrorBanner
                    errors={{ ...schemaErrors, ...fieldErrors }}
                    labels={{
                      title: labels.bannerTitle,
                      errors: labels.errors,
                    }}
                  />
                }
                pageFields={
                  <>
                    <div
                      {...tid("editor-identity-fields")}
                      className="grid gap-6 rounded-xl surface border-(--edge) bg-(--surface-solid) p-3 sm:p-4"
                    >
                      {/* **A person has no handle field at all.** Theirs is the provisioned
            `u-<actor_ref>`, which nobody picks and which appears in no
            address — so there is nothing to edit and nothing worth showing.
            Everything else on this form is identical for both. */}
                      {kind === "person" ? null : (
                        <div className="grid gap-1.5">
                          <label
                            htmlFor="handle"
                            className="text-sm font-medium"
                          >
                            {labels.handle}
                          </label>
                          {handleEditable ? (
                            <>
                              <input
                                id="handle"
                                {...tid("editor-handle")}
                                {...register("handle")}
                                maxLength={32}
                                aria-invalid={Boolean(errors.handle)}
                                aria-describedby="handle-hint"
                                className="rounded-lg surface border-(--edge)/60 bg-transparent px-3 py-2"
                              />
                              <span
                                id="handle-hint"
                                className="text-xs text-(--muted)"
                              >
                                {labels.handleHint}
                              </span>
                            </>
                          ) : (
                            // Read-only text rather than a disabled input: update_fursona takes
                            // no handle at all, so an editable one would submit a value the
                            // database ignores.
                            <span className="px-3 py-2 font-mono text-sm text-(--muted)">
                              @{initial?.handle}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="grid gap-1.5">
                        <label
                          htmlFor="displayName"
                          className="text-sm font-medium"
                        >
                          {labels.displayName}
                        </label>
                        <input
                          id="displayName"
                          {...tid("editor-display-name")}
                          {...register("displayName")}
                          maxLength={64}
                          aria-invalid={Boolean(errors.displayName)}
                          className="rounded-lg surface border-(--edge)/60 bg-transparent px-3 py-2"
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <label
                          htmlFor="avatarUrl"
                          className="text-sm font-medium"
                        >
                          {labels.avatarUrl}
                        </label>
                        <input
                          id="avatarUrl"
                          {...register("avatarUrl")}
                          type="url"
                          aria-invalid={Boolean(errors.avatarUrl)}
                          className="rounded-lg surface border-(--edge)/60 bg-transparent px-3 py-2"
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <label
                          htmlFor="visibility"
                          className="text-sm font-medium"
                        >
                          {labels.visibilityLabel}
                        </label>
                        <select
                          id="visibility"
                          {...tid("editor-visibility")}
                          {...register("visibility")}
                          aria-invalid={Boolean(errors.visibility)}
                          className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-2"
                        >
                          {VISIBILITIES.map((value) => (
                            <option key={value} value={value}>
                              {labels.visibility[value]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                }
                // **Its own tab now, not a `mt-8` sibling of the identity
                // fields (2026-09-04).** The Properties panel's Page
                // selection routes this to Theme, its OWN pane — the two-tab
                // split this component's own `mt-8` margin existed to fake
                // by spacing, on a page where both used to share one Options
                // pane. The panel's own `gap-2` between tab content is
                // spacing enough; a margin meant for a sibling would be
                // furniture at the top of a pane with nothing above it.
                pageTheme={
                  <ThemeController
                    control={control}
                    labels={labels.theme}
                    profileTheme={profileTheme}
                  />
                }
              />
            </div>
          </AddSlotProvider>

          {/* **PORTALLED INTO THE HEADER, which is outside the element the rule
          arms** — so it needs no exception, cannot be part of what the fidelity
          comparison photographs, and cannot be hidden by the rule it exists to
          undo. It is the only thing on screen that is not the page.

          It cannot go in the EDITOR's toolbar, however much it reads like a bar
          control: that bar is inside the armed element and the rule removes
          `CHROME_SCOPE` islands by class, so a button there would be hidden by
          the press that summons it. `fursona-editor.test.tsx` pins that.

          It was `fixed` to a corner and that was wrong twice. Bottom right
          covered the page's own foot, which is part of what somebody hides the
          controls to look at; top right then covered the language and
          light/dark toggles by 88% each, making both impossible to press. A control
          out of flow has no way to know what it lands on, so it sits in the
          header's own row now and displaces rather than covers. */}
          {controlsHidden && escapeSlot
            ? createPortal(
                <button
                  type="button"
                  onClick={() => {
                    setControlsHidden(false);
                    // **Show controls always resets the switch, even though
                    // Preview never touched it.** Preview gets interaction
                    // through `controlsHidden` alone; the explicit switch is
                    // what the spec calls a SESSION choice reset by returning
                    // to safe editing, not a value Preview is allowed to leave
                    // sitting on for the next time controls come back.
                    setInteractEnabled(false);
                  }}
                  {...tid("show-controls")}
                  // **Still `CHROME_SCOPE` and still opaque.** The header wears
                  // the author's theme like the rest of the document, so a
                  // translucent control here has no guaranteed contrast against
                  // colours they chose. `--menu` is the one token declared
                  // opaque in both modes.
                  className={`${CHROME_SCOPE} flex items-center gap-1.5 rounded-lg bg-(--menu) px-3 py-1.5 text-sm font-medium [--chrome-text:0.875rem]`}
                >
                  <EyeOff className="size-4" />
                  {labels.showControls}
                </button>,
                escapeSlot,
              )
            : null}
        </ThemeScope>
      </form>
    </EditorMotion>
  );
}

/**
 * Writes a whole chosen page — blocks, and a look when there is one — to the
 * form.
 *
 * **The ONE path a document reaches the editor by**, whatever chose it: a
 * pasted document from the source dock, and a template picked from the list.
 * Two implementations would have looked identical the day they were written
 * and disagreed the first time either changed, and the thing they would
 * disagree about is destructive.
 *
 * **`if (theme)` is load-bearing and must not become unconditional.** A null
 * theme means "leave whatever the author already chose" — absence is inherit
 * everywhere in this model — so writing one through would reset somebody's
 * palette on every document and every template that carries none, which is
 * every shipped starter. That exact branch shipped untested once on the dock
 * and had to be closed in review; `fursona-editor.test.tsx` aims a case at it.
 *
 * @param setValue - the form's writer.
 * @param chosen - the page, and the look to wear it in.
 */
function applyDocumentTo<T extends FieldValues>(
  setValue: UseFormSetValue<T>,
  chosen: ChosenPage,
): void {
  setValue("sections" as Path<T>, chosen.blocks as PathValue<T, Path<T>>, {
    shouldDirty: true,
  });
  if (chosen.theme) {
    setValue("theme" as Path<T>, chosen.theme as PathValue<T, Path<T>>, {
      shouldDirty: true,
    });
  }
}

/**
 * The page-source dock's live binding, isolated in its own component.
 *
 * **Why this exists rather than a `useWatch` call in `FursonaEditor`
 * itself.** `FursonaEditor` watches `handle`, `displayName`, `avatarUrl` and
 * `theme` directly because every one of those already has to reach its own
 * render — the toolbar's title, the identity-leaf preview overlay, the
 * gated `PageThemeSwitch`. `sections` does not: nothing in `FursonaEditor`'s
 * own render reads it, exactly as `BlockEditor` already proved by holding its
 * own `useController({ control, name: "sections" })` rather than being handed
 * the tree as a prop, so a change to `sections` re-renders `BlockEditor` and
 * nothing above it. This component does the same for
 * {@link usePageSource}'s `blocks`: the subscription lives here, so typing in
 * a leaf's own text re-renders this component and the dock it draws, never
 * `EditorToolbar` two levels up. An earlier version of this wiring watched
 * `sections` in `FursonaEditor` directly, and
 * `fursona-editor.test.tsx`'s toolbar-render-count case is the regression
 * test that caught it.
 *
 * `theme` is a prop rather than a second watch, because `FursonaEditor`
 * already holds the live theme for its own reasons above — watching it twice
 * would be a second subscription answering a question the caller already
 * has the answer to.
 *
 * **`apply`'s `theme` half is written only when it is non-null.** A pasted
 * document that names no theme at all answers `theme: null` from
 * `usePageSource`, and that means leave the person's current theme alone —
 * see that hook's own TSDoc for the contract. Writing it unconditionally would
 * reset an author's theme to whatever `themeSchema` resolves `null` to on
 * the very next accepted parse of a document that never mentioned a theme,
 * which is silent: nothing renders differently in the moment, and the loss
 * only shows up the next time somebody opens the theme panel.
 *
 * @returns the dock.
 */
function PageSourceField<T extends FieldValues>({
  control,
  setValue,
  theme,
  actorKind,
  open,
  onClose,
  reference,
  labels,
}: {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  theme: ActorTheme;
  actorKind: ActorKind;
  open: boolean;
  onClose: () => void;
  reference: string;
  labels: PageSourceDockLabels;
}) {
  const blocks = useWatch({
    control,
    name: "sections" as Path<T>,
  }) as Block[];
  const source = usePageSource({
    theme,
    blocks,
    actorKind,
    apply: (chosen) => applyDocumentTo(setValue, chosen),
  });

  return (
    <PageSourceDock
      open={open}
      onClose={onClose}
      source={source}
      reference={reference}
      labels={labels}
    />
  );
}

/**
 * The theme panel, bound to the form.
 *
 * A controller and not a `register`: the configurator hands back a whole theme
 * object on every change, which is not something a form input's `value` can
 * carry.
 *
 * @returns the panel.
 */
function ThemeController<T extends FieldValues>({
  control,
  labels,
  profileTheme,
}: {
  control: Control<T>;
  labels: ThemeConfiguratorLabels;
  profileTheme?: ActorTheme;
}) {
  const field = useController({ control, name: "theme" as Path<T> });
  return (
    <ThemeConfigurator
      value={field.field.value as ActorTheme}
      onChange={field.field.onChange}
      labels={labels}
      copyFrom={profileTheme}
    />
  );
}
