import type { FursonaSection } from "@/features/actors/domain/section-schema";

/**
 * A starting layout somebody can begin a fursona's page from.
 *
 * There is no `name` or `description` here on purpose. Those are the picker's
 * words — ours — so they belong in the message catalogue keyed by `id`, where a
 * missing Spanish one fails the build. The `sections` do not: the instant a
 * template is applied they are the person's own writing, to edit or delete, and
 * a catalogue key cannot describe a string somebody else is about to rewrite.
 */
export interface FursonaTemplate {
  /** Stable key, and the catalogue key for the name and description. */
  id: string;
  /** What applying it puts in the editor. Never handed out unwrapped. */
  sections: FursonaSection[];
}

/**
 * The starting layouts the hub ships.
 *
 * **In code, not in a table.** A `fursona_templates` table would cost a
 * migration, rows and a read on every editor open, and buy nothing while the
 * templates are ours to write. The spec sets the trigger for changing that:
 * when somebody other than us needs to author one, and not before.
 *
 * Every template ships **guidance text, not blanks** — and that is forced
 * rather than chosen. `sectionItemSchema` requires a non-empty title and
 * description, so a template of empty scaffolding would be refused by our own
 * editor the moment somebody pressed Save. `fursona-templates.test.ts` parses
 * every one of these through `sectionsSchema`, so a template that could not be
 * saved cannot be shipped.
 *
 * **Callers must clone before handing these to a form.** The array is frozen
 * shallowly and its contents are not: a reference passed straight into
 * `useFieldArray` would let one person's edits rewrite the shipped constant for
 * the rest of the session. `TemplatePicker` does the `structuredClone`, and its
 * test is the only thing that can catch its absence.
 */
export const FURSONA_TEMPLATES: readonly FursonaTemplate[] = Object.freeze([
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
            description_en:
              "Say what your character is — one species, a hybrid, or something of your own.",
            description_es:
              "Di qué es tu personaje: una especie, un híbrido, o algo tuyo.",
            icon: "paw-print",
            sort_order: 1,
          },
          {
            title_en: "Pronouns",
            title_es: "Pronombres",
            description_en: "How people should refer to your character.",
            description_es: "Cómo deberían referirse a tu personaje.",
            icon: "message-circle",
            sort_order: 2,
          },
          {
            title_en: "Age",
            title_es: "Edad",
            description_en:
              "However you like to give it — a number, a range, or simply adult.",
            description_es:
              "Como prefieras darla: un número, un rango, o simplemente adulto.",
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
            description_en:
              "The patterns that make your character recognisable at a glance.",
            description_es:
              "Los patrones que hacen a tu personaje reconocible de un vistazo.",
            sort_order: 1,
          },
          {
            title_en: "Colours",
            title_es: "Colores",
            description_en:
              "The palette, and anything an artist should not change.",
            description_es:
              "La paleta, y todo lo que un artista no debería cambiar.",
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
            description_en: "What your character is like to be around.",
            description_es: "Cómo es estar cerca de tu personaje.",
            sort_order: 1,
          },
          {
            title_en: "Backstory",
            title_es: "Historia",
            description_en: "Where they came from, and what shaped them.",
            description_es: "De dónde vienen, y qué los formó.",
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
            description_en: "The things that make their day.",
            description_es: "Las cosas que les alegran el día.",
            sort_order: 1,
          },
          {
            title_en: "Dislikes",
            title_es: "Disgustos",
            description_en: "The things that do not.",
            description_es: "Las cosas que no.",
            sort_order: 2,
          },
          {
            title_en: "Quirks",
            title_es: "Manías",
            description_en:
              "The small habits people notice after knowing them a while.",
            description_es:
              "Los pequeños hábitos que se notan tras conocerlos un rato.",
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
            description_en: "Add the image address, and say what it is.",
            description_es: "Añade la dirección de la imagen, y di qué es.",
            image_url: "",
            sort_order: 1,
          },
          {
            title_en: "Second piece",
            title_es: "Segunda pieza",
            description_en: "Add the image address, and say what it is.",
            description_es: "Añade la dirección de la imagen, y di qué es.",
            image_url: "",
            sort_order: 2,
          },
          {
            title_en: "Third piece",
            title_es: "Tercera pieza",
            description_en: "Add the image address, and say what it is.",
            description_es: "Añade la dirección de la imagen, y di qué es.",
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
            description_en:
              "Name whoever drew each piece, and link them if you can.",
            description_es:
              "Nombra a quién dibujó cada pieza, y pon un enlace si puedes.",
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
            description_en: "Who built it, and link them if you can.",
            description_es: "Quién lo construyó, y un enlace si puedes.",
            icon: "hammer",
            sort_order: 1,
          },
          {
            title_en: "Materials",
            title_es: "Materiales",
            description_en: "Fur, foam, resin — whatever it is made of.",
            description_es: "Pelo, espuma, resina: de lo que esté hecho.",
            icon: "layers",
            sort_order: 2,
          },
          {
            title_en: "Debut",
            title_es: "Debut",
            description_en: "Where it was first worn.",
            description_es: "Dónde se usó por primera vez.",
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
            description_en: "Add the image address, and say what it is.",
            description_es: "Añade la dirección de la imagen, y di qué es.",
            image_url: "",
            sort_order: 1,
          },
          {
            title_en: "Full suit",
            title_es: "Traje completo",
            description_en: "Add the image address, and say what it is.",
            description_es: "Añade la dirección de la imagen, y di qué es.",
            image_url: "",
            sort_order: 2,
          },
        ],
      },
    ],
  },
]);
