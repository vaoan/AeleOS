"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { PageContext } from "@/features/actors/presentation/blocks";
import {
  useController,
  useForm,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { useRouter } from "@/shared/infrastructure/i18n/navigation";
import { tid } from "@/shared/infrastructure/test-id";
import { useFursonaEditor } from "@/features/actors/application/use-fursona-editor";
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
  DEFAULT_THEME,
  themeSchema,
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
import { withRequiredBlocks } from "@/features/actors/domain/required-blocks";
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
 */
export interface FursonaEditorLabels
  extends EditorToolbarLabels, BlockEditorLabels {
  /** The theme panel's own strings, nested to avoid a `title` collision. */
  theme: ThemeConfiguratorLabels;
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
 * **The language strip sits directly above the sections it governs, below the
 * theme panel.** `lang` reaches only `BlockEditor` — `fursonaSchema` has no
 * `_en`/`_es` field at all — so a strip that used to sit above the theme panel
 * announced itself over the top fields it does not touch, separated from the
 * ones it does by however tall that panel happened to be open. Its sticky
 * offset, `top-(--bar-top-2)`, which is under both bars above it, is correct
 * as a consequence of the new position rather than by design: it now comes
 * into force exactly when the sections are on screen, instead of hovering
 * over somebody picking colours. Pinned near the top it was covered by the
 * toolbar and covered the page header in turn, so on every screen size the
 * control it holds was unreachable for as long as anybody scrolled. It
 * carries `short:static`, so on a screen too short for three bars it scrolls
 * away and leaves the top to Save — see `globals.css`, where the offsets are
 * declared together.
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
 * it governs how all of them look, and it is collapsed until somebody opens
 * it — theming is a thing people do once and then leave alone, so an open
 * colour panel would push everything below it down the page for everybody who
 * never touches it. Its changes are previewed locally and written with the
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
 * Its panels and fields carry `surface`, the class a skin styles — six of them, so a theme reaches the whole editor rather than half of it.
 *
 * **A refused page gets one of three sentences, not one of two** — see
 * {@link sectionsCode}. The middle one exists because a refusal on a
 * container's own field is marked now, so the banner may say a marking was
 * made, but naming the missing English title would be naming a cause that is
 * not the cause.
 *
 * `page` is threaded to {@link BlockEditor} and read nowhere here — see
 * {@link FursonaEditorProps}.
 *
 * **The block editor previews from the LIVE form, not from the saved page.**
 * Identity leaves render out of the page context, so handing down the one the
 * route resolved would show somebody the portrait and handle they had before
 * they started editing — a preview quietly disagreeing with the form directly
 * above it. Three fields are overlaid from `useWatch`; the rest of the context
 * is the route's, because an address is assigned rather than typed and a
 * fursona's owner is not something its editor can change.
 *
 * **A page being CREATED opens with its required blocks**, the same
 * `withRequiredBlocks` output `readActorPage` answers for an actor with
 * nothing stored. The create page has no actor to read, so it fell through to
 * an empty tree — which `set_actor_sections` refuses, making a fursona built
 * by hand impossible to save at all.
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

  const {
    control,
    register,
    handleSubmit,
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
  const [liveHandle, liveName, liveAvatar] = useWatch({
    control,
    name: ["handle", "displayName", "avatarUrl"],
  });
  const livePage: PageContext = {
    ...page,
    handle: liveHandle || page.handle,
    displayName: liveName || null,
    avatarUrl: liveAvatar || null,
  };

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
    <form
      onSubmit={handleSubmit(async (values) => {
        // The RETURN VALUE decides, never `fieldErrors`. That variable is
        // captured from the render that built this handler, so it is still
        // empty when the save fails — and the editor used to navigate away on
        // a refusal, hiding the reason and taking the person's typing with it.
        if (await save(values)) router.push(LIST);
      })}
    >
      <EditorToolbar
        title={labels.title}
        labels={labels}
        saving={saving}
        cancelHref={LIST}
      />

      <FormErrorBanner
        errors={{ ...schemaErrors, ...fieldErrors }}
        labels={{ title: labels.bannerTitle, errors: labels.errors }}
      />

      {/* Explicit htmlFor/id rather than wrapping each input in its label.
          A wrapping label takes its whole text content as the field's
          accessible name, so the handle's hint became part of the name and it
          announced as "Handle 1-32 characters." The hint is attached with
          aria-describedby instead, which is what it is for. */}
      <div className="grid gap-6">
        {/* **A person has no handle field at all.** Theirs is the provisioned
            `u-<actor_ref>`, which nobody picks and which appears in no
            address — so there is nothing to edit and nothing worth showing.
            Everything else on this form is identical for both. */}
        {kind === "person" ? null : (
          <div className="grid gap-1.5">
            <label htmlFor="handle" className="text-sm font-medium">
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
                <span id="handle-hint" className="text-xs text-(--muted)">
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
          <label htmlFor="displayName" className="text-sm font-medium">
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
          <label htmlFor="avatarUrl" className="text-sm font-medium">
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
          <label htmlFor="visibility" className="text-sm font-medium">
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

      {/* Above the language strip and the sections, because it governs how
          all of them look. The panel is collapsed until somebody opens it —
          theming is a thing people do once and then leave alone, and an open
          colour panel would push everything below it down the page for
          everybody who never touches it. */}
      <div className="mt-8">
        <ThemeController
          control={control}
          labels={labels.theme}
          profileTheme={profileTheme}
        />
      </div>

      {/* Directly above the sections it governs, and nothing else: `lang`
          reaches only `SectionEditor`, so a strip sitting between the top
          fields and the theme panel used to announce itself over content it
          does not touch. Its `sticky` offset is what makes this position
          correct rather than merely tidier — it comes into force exactly
          when the sections it governs are on screen. */}
      <div className="sticky top-(--bar-top-2) z-10 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl surface border-(--edge) bg-(--bar)/95 p-3 backdrop-blur-sm short:static">
        <div className="grid gap-0.5">
          <span className="font-display text-sm font-bold">
            {labels.writingIn}
          </span>
          <span className="text-xs text-(--muted)">{labels.writingInHint}</span>
        </div>

        {/*
          Both languages are on screen and each names itself, so nothing has to
          be inferred from a single label. The endonyms are deliberately not
          translated: a language is called the same thing whatever interface
          you are reading, and "Spanish"/"Español" changing under somebody is
          how a language picker becomes unreadable to the person who needs it.
        */}
        <div
          role="group"
          aria-label={labels.writingIn}
          className="flex rounded-lg surface border-(--edge) p-0.5"
        >
          {(
            [
              ["en", "English"],
              ["es", "Español"],
            ] as const
          ).map(([value, name]) => (
            <button
              key={value}
              type="button"
              onClick={() => select(value)}
              aria-pressed={lang === value}
              {...tid(`writing-in-${value}`)}
              className={
                lang === value
                  ? "rounded-md bg-(--accent) px-4 py-1.5 text-sm font-medium text-(--on-accent)"
                  : "rounded-md px-4 py-1.5 text-sm font-medium text-(--muted)"
              }
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <BlockEditor
        control={control}
        lang={lang}
        labels={labels}
        // **The LIVE form values, not the saved ones.** An identity leaf
        // renders from the page context, and every section previews with the
        // real renderer — so handing the context the route built would show
        // somebody the portrait they had before they started editing, and the
        // preview would quietly disagree with the form six inches above it.
        page={livePage}
        problems={problems}
      />
    </form>
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
