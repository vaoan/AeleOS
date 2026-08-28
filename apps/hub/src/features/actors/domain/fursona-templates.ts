import type { FursonaSection } from "@/features/actors/domain/section-schema";
import { sectionsToBlocks } from "@/features/actors/domain/section-block-shim";
import type { Block } from "@/features/actors/domain/block-schema";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import { ERA_LOOKS } from "@/features/actors/domain/era-looks";

/**
 * A starting layout somebody can begin a fursona's page from.
 *
 * There is no `name` or `description` here on purpose. Those are the picker's
 * words — ours — so they belong in the message catalogue keyed by `id`, where a
 * missing Spanish one fails the build. The `sections` do not: the instant a
 * template is applied they are the person's own writing, to edit or delete, and
 * a catalogue key cannot describe a string somebody else is about to rewrite.
 */
export interface StarterLayout {
  /** Stable key, and the catalogue key for the name and description. */
  id: string;
  /** The layout, authored in the flat vocabulary. */
  sections: FursonaSection[];
}

/**
 * A page and the look to wear it in, as chosen by a person.
 *
 * **One named shape rather than the same object literal in four places.** It
 * is what the picker hands out, what `BlockEditor` forwards, and what the
 * editor's one `applyDocument` writes — and it is deliberately the same shape
 * `parseDocument` returns, so a pasted document and a picked template are
 * indistinguishable by the time either reaches the form.
 *
 * `theme` is nullable and never optional: null means **leave the author's
 * colours alone**, and a look that forgot to say so should be a type error
 * rather than a silent reset.
 */
export interface ChosenPage {
  /** The page to put in the editor. */
  blocks: Block[];
  /** The look to apply, or null to keep whatever the author already chose. */
  theme: ActorTheme | null;
}

/**
 * A pickable starting point: a page, a look, and a key naming it.
 *
 * **This is what the picker offers, and it is deliberately not how a starter
 * is AUTHORED.** The shipped starters are written as flat sections — see
 * {@link STARTER_LAYOUTS} — because that is the vocabulary their guards are
 * written in, and those guards are about our own authorship rather than about
 * the shim's output. What a caller receives is blocks, because blocks are what
 * the editor holds.
 *
 * There is no `name` or `description` here on purpose. Those are the picker's
 * words — ours — so they belong in the message catalogue keyed by `id`, where
 * a missing Spanish one fails the build. The page does not: the instant a
 * template is applied it is the person's own writing, and a catalogue key
 * cannot describe a string somebody else is about to rewrite.
 */
export interface FursonaTemplate extends ChosenPage {
  /** Stable key, and the catalogue key for the name and description. */
  id: string;
}

/**
 * The starting layouts the hub ships.
 *
 * **In code, not in a table.** A `fursona_templates` table would cost a
 * migration, rows and a read on every editor open, and buy nothing while the
 * templates are ours to write. The spec sets the trigger for changing that:
 * when somebody other than us needs to author one, and not before.
 *
 * **A template ships structure, never prose.** Titles, layouts, icons and order
 * are ours to choose; every description is empty, because whatever sits in one
 * is the person's own writing the instant the template is applied.
 *
 * It used to ship guidance sentences in those descriptions — "Say what your
 * character is: one species, a hybrid, or something of your own" — and the
 * result was a page created from a template and published unedited reading its
 * own instructions out to strangers, in its owner's voice. The prompt now lives
 * where a prompt belongs: the editor's description field carries a placeholder
 * per content kind, so it helps while somebody writes, and is never stored,
 * never published, and never has to be deleted.
 *
 * That was blocked by `sectionItemSchema` requiring a non-empty description,
 * which it no longer does — `0009` always accepted an empty one, so nothing in
 * the database had to move. `fursona-templates.test.ts` parses every template
 * through `sectionsSchema`, so one that could not be saved still cannot ship,
 * and it now also asserts that none of them carries a description at all.
 *
 * **Callers must clone before handing these to a form.** The array is frozen
 * shallowly and its contents are not: a reference passed straight into
 * `useFieldArray` would let one person's edits rewrite the shipped constant for
 * the rest of the session. `TemplatePicker` does the `structuredClone`, and its
 * test is the only thing that can catch its absence.
 */
export const STARTER_LAYOUTS: readonly StarterLayout[] = Object.freeze([
  {
    id: "reference-sheet",
    sections: [
      {
        name_en: "The basics",
        name_es: "Lo basico",
        type: "cards",
        sort_order: 1,
        items: [
          {
            title_en: "Species",
            title_es: "Especie",
            description_en: "",
            description_es: "",
            icon: "paw-print",
            sort_order: 1,
          },
          {
            title_en: "Pronouns",
            title_es: "Pronombres",
            description_en: "",
            description_es: "",
            icon: "message-circle",
            sort_order: 2,
          },
          {
            title_en: "Age",
            title_es: "Edad",
            description_en: "",
            description_es: "",
            icon: "calendar",
            sort_order: 3,
          },
        ],
      },
      {
        name_en: "Design notes",
        name_es: "Notas de diseño",
        type: "two-column",
        sort_order: 2,
        items: [
          {
            title_en: "Markings",
            title_es: "Marcas",
            description_en: "",
            description_es: "",
            sort_order: 1,
          },
          {
            title_en: "Colours",
            title_es: "Colores",
            description_en: "",
            description_es: "",
            sort_order: 2,
          },
        ],
      },
    ],
  },
  {
    id: "character-story",
    sections: [
      {
        name_en: "About",
        name_es: "Acerca de",
        type: "two-column",
        sort_order: 1,
        items: [
          {
            title_en: "Personality",
            title_es: "Personalidad",
            description_en: "",
            description_es: "",
            sort_order: 1,
          },
          {
            title_en: "Backstory",
            title_es: "Historia",
            description_en: "",
            description_es: "",
            sort_order: 2,
          },
        ],
      },
      {
        name_en: "Details",
        name_es: "Detalles",
        type: "accordion",
        sort_order: 2,
        items: [
          {
            title_en: "Likes",
            title_es: "Gustos",
            description_en: "",
            description_es: "",
            sort_order: 1,
          },
          {
            title_en: "Dislikes",
            title_es: "Disgustos",
            description_en: "",
            description_es: "",
            sort_order: 2,
          },
          {
            title_en: "Quirks",
            title_es: "Manías",
            description_en: "",
            description_es: "",
            sort_order: 3,
          },
        ],
      },
    ],
  },
  {
    id: "art-gallery",
    sections: [
      {
        name_en: "Gallery",
        name_es: "Galería",
        type: "gallery",
        sort_order: 1,
        items: [
          {
            title_en: "First piece",
            title_es: "Primera pieza",
            description_en: "",
            description_es: "",
            image_url: "",
            sort_order: 1,
          },
          {
            title_en: "Second piece",
            title_es: "Segunda pieza",
            description_en: "",
            description_es: "",
            image_url: "",
            sort_order: 2,
          },
          {
            title_en: "Third piece",
            title_es: "Tercera pieza",
            description_en: "",
            description_es: "",
            image_url: "",
            sort_order: 3,
          },
        ],
      },
      {
        name_en: "Credits",
        name_es: "Créditos",
        type: "accordion",
        sort_order: 2,
        items: [
          {
            title_en: "Artists",
            title_es: "Artistas",
            description_en: "",
            description_es: "",
            sort_order: 1,
          },
        ],
      },
    ],
  },
  {
    id: "fursuit",
    sections: [
      {
        name_en: "The suit",
        name_es: "El fursuit",
        type: "cards",
        sort_order: 1,
        items: [
          {
            title_en: "Maker",
            title_es: "Constructor",
            description_en: "",
            description_es: "",
            icon: "hammer",
            sort_order: 1,
          },
          {
            title_en: "Materials",
            title_es: "Materiales",
            description_en: "",
            description_es: "",
            icon: "layers",
            sort_order: 2,
          },
          {
            title_en: "Debut",
            title_es: "Debut",
            description_en: "",
            description_es: "",
            icon: "party-popper",
            sort_order: 3,
          },
        ],
      },
      {
        name_en: "Gallery",
        name_es: "Galería",
        type: "gallery",
        sort_order: 2,
        items: [
          {
            title_en: "Head",
            title_es: "Cabeza",
            description_en: "",
            description_es: "",
            image_url: "",
            sort_order: 1,
          },
          {
            title_en: "Full suit",
            title_es: "Traje completo",
            description_en: "",
            description_es: "",
            image_url: "",
            sort_order: 2,
          },
        ],
      },
    ],
  },
]);

/**
 * The starting points the picker offers.
 *
 * Derived from {@link STARTER_LAYOUTS} rather than authored twice: the flat
 * form is what the guards in `fursona-templates.test.ts` read, and converting
 * here means a starter cannot be correct in one shape and wrong in the other.
 *
 * The conversion runs once at module scope rather than per application. It is
 * the shim's remaining reason to exist — see `section-block-shim.ts`, which
 * converts ONE way now — and it is why a starter can go on being written in
 * the vocabulary it reads best in while the editor only ever sees blocks.
 *
 * **Every starter carries `theme: null`.** They are what the app suggests
 * somebody WRITE, not a look it suggests they wear, and null means leave the
 * author's colours alone.
 *
 * **The era looks are appended, and they are the opposite kind of thing.** A
 * starter is structure with no palette; a look is mostly palette. They share
 * this list because they share a control — picking a starting point and
 * picking a look are the same act — and the `era-` prefix is what tells them
 * apart wherever the difference matters. It matters in two places: the guard
 * that stops a palette being quietly attached to a STARTER, and the picker,
 * which withholds a look from a page whose kind refuses it.
 */
export const FURSONA_TEMPLATES: readonly FursonaTemplate[] = Object.freeze([
  ...STARTER_LAYOUTS.map((layout) => ({
    id: layout.id,
    blocks: sectionsToBlocks(layout.sections),
    theme: null,
  })),
  // **The era looks sit after the starters, and they are a different kind of
  // thing.** A starter is structure and carries no theme; a look is mostly
  // theme and carries a whole palette. They share this list because they share
  // a control — somebody picking a starting point and somebody picking a look
  // are doing the same thing — and `era-` is what tells them apart wherever
  // the difference matters.
  ...ERA_LOOKS,
]);
