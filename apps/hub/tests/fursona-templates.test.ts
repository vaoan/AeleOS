import { describe, expect, it } from "vitest";
import { iconNames } from "lucide-react/dynamic";
import {
  FURSONA_TEMPLATES,
  STARTER_LAYOUTS,
} from "@/features/actors/domain/fursona-templates";
import { sectionsSchema } from "@/features/actors/domain/section-schema";
import {
  parseDocument,
  toDocument,
} from "@/features/actors/domain/page-document";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";

// **The guards below read the AUTHORED form, which is still flat sections.**
// A starter is written that way because these rules — both languages, no
// prose, icons only on cards, explicit `sort_order` — are rules about what we
// wrote, and rewriting them against the converted blocks would be asserting
// the shim's output rather than our own authorship.
const each = STARTER_LAYOUTS.map((layout) => [layout.id, layout] as const);

describe("FURSONA_TEMPLATES", () => {
  it("ships templates at all", () => {
    expect(STARTER_LAYOUTS.length).toBeGreaterThan(0);
  });

  // The id is the catalogue key for the name and the description, so a
  // duplicate would silently give two templates one label.
  it("gives every template a distinct id", () => {
    const ids = STARTER_LAYOUTS.map((layout) => layout.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The guard that matters. `sectionItemSchema` still requires a non-empty
  // TITLE, so a template of entirely empty scaffolding would be refused by our
  // own editor the moment somebody pressed Save — found by them, not by us.
  it.each(each)(
    "%s parses as sections the editor would accept",
    (_id, template) => {
      expect(() => sectionsSchema.parse(template.sections)).not.toThrow();
    },
  );

  // We are the author of the STRUCTURE until the moment a template is applied,
  // so we owe both languages for every word we choose. After it is applied the
  // words are the person's and a missing Spanish is simply one they have not
  // written yet.
  it.each(each)(
    "%s names every section and item in both languages",
    (_id, template) => {
      for (const section of template.sections) {
        expect(section.name_en).toBeTruthy();
        expect(section.name_es).toBeTruthy();
        for (const item of section.items) {
          expect(item.title_en).toBeTruthy();
          expect(item.title_es).toBeTruthy();
        }
      }
    },
  );

  // **THE REGRESSION TEST for a template reading its instructions out to
  // strangers.** These used to carry guidance sentences as the item's
  // description — "Say what your character is: one species, a hybrid, or
  // something of your own" — so a page created from a template and published
  // unedited told visitors what its owner was supposed to write, in their
  // voice. Nothing failed; it simply read as very strange writing.
  //
  // The prompt is the editor's placeholder now. A description here is content,
  // and content is the person's.
  it.each(each)("%s ships no description at all", (_id, template) => {
    for (const section of template.sections) {
      for (const item of section.items) {
        expect(item.description_en).toBe("");
        expect(item.description_es ?? "").toBe("");
      }
    }
  });

  // A template that seeds a field its layout will not show is a template that
  // teaches the trap task 2 exists to close.
  it.each(each)(
    "%s seeds icons only on cards and images only on galleries",
    (_id, template) => {
      // Every misplacement is collected and named, rather than asserted inside
      // the test that finds it: a template with no icons and no images would
      // otherwise pass this without a single assertion running.
      const misplaced = template.sections.flatMap((section) =>
        section.items
          .filter(
            (item) =>
              (item.icon !== undefined && section.type !== "cards") ||
              (item.image_url !== undefined && section.type !== "gallery"),
          )
          .map((item) => `${section.type} holds ${JSON.stringify(item)}`),
      );
      expect(misplaced).toEqual([]);
    },
  );

  // Deliberately NOT mocked here, unlike every component test in this phase.
  // IconPicker renders the empty state for a name lucide does not have, so a
  // typo in a seeded icon would ship as a template with a blank where a picture
  // was meant to be — and no mocked test could ever see it.
  it.each(each)("%s seeds only icons lucide actually has", (_id, template) => {
    const seeded = template.sections.flatMap((section) =>
      section.items.map((item) => item.icon).filter(Boolean),
    );
    for (const icon of seeded) {
      expect(iconNames as readonly string[]).toContain(icon);
    }
  });

  // WHAT THE PICKER ACTUALLY HANDS OUT.
  //
  // A template is authored as flat sections above and DERIVED into blocks, so
  // everything up to here guards our authorship and nothing has yet asked
  // whether the derived thing is a page the product would accept.
  //
  // These carry the guarantee that re-parsing at runtime would have bought.
  // Shipped templates are ours and type-checked, so pushing them through
  // `parseDocument` on every application would look for errors the compiler
  // already refuses — but pushing them through it HERE means a template the
  // real parser rejects fails the build rather than somebody's editor. It is
  // the same code a pasted document meets: depth caps, block limits, the
  // unsafe-key reviver and `parseTheme`.
  describe("the documents the picker hands out", () => {
    it("derives one block per authored section", () => {
      // **Starters only.** The list also carries era looks now, which are
      // authored as blocks and have no sections to derive from — so comparing
      // the whole list against `STARTER_LAYOUTS` would be comparing two
      // different things. The starters come first, which is what makes the
      // index line up.
      const starters = FURSONA_TEMPLATES.filter(
        (one) => !one.id.startsWith("era-"),
      );
      // Anti-vacuity for everything below: a derivation that silently produced
      // nothing would satisfy every `it.each` on an empty list.
      expect(starters.length).toBe(STARTER_LAYOUTS.length);
      for (const [index, template] of starters.entries()) {
        expect(template.blocks).toHaveLength(
          STARTER_LAYOUTS[index]!.sections.length,
        );
      }
    });

    // **A STARTER fits either kind of page and an era look does not.** A look
    // names `owner`, which a person's page refuses, and the picker withholds
    // one there — see `fitsActorKind`. So this asks of starters what is true of
    // starters; `era-looks.test.ts` asserts the looks' own shape.
    it.each(["fursona", "person"] as const)(
      "ships starter pages a %s's own parser accepts",
      (kind) => {
        for (const template of FURSONA_TEMPLATES.filter(
          (one) => !one.id.startsWith("era-"),
        )) {
          const parsed = parseDocument(
            toDocument(template.theme ?? DEFAULT_THEME, [...template.blocks]),
            kind,
          );
          // Named, so a failure says WHICH template rather than that one of
          // several is wrong.
          expect(parsed.ok, `${template.id} parses for a ${kind}`).toBe(true);
        }
      },
    );

    // **The starters are STRUCTURE, not a look.** They are what the app
    // suggests somebody write, not a palette it suggests they wear, and null
    // means "leave the author's colours alone". The era looks phase 2 adds are
    // the opposite and will carry one; this is what would redden if a palette
    // were ever quietly attached to a starter.
    it.each(
      FURSONA_TEMPLATES.filter((one) => !one.id.startsWith("era-")).map(
        (one) => [one.id, one] as const,
      ),
    )(
      "%s carries no theme, because a STARTER is structure",
      (_id, template) => {
        expect(template.theme).toBeNull();
      },
    );

    // The other half of that, so the filter above cannot quietly select
    // nothing: an era look is the opposite kind of thing and MUST carry one.
    it("ships era looks, and every one of them carries a theme", () => {
      const looks = FURSONA_TEMPLATES.filter((one) =>
        one.id.startsWith("era-"),
      );
      expect(looks.length).toBeGreaterThan(0);
      for (const look of looks) {
        expect(look.theme, `${look.id} carries a theme`).not.toBeNull();
      }
    });
  });

  // 0013 stores sort_order; array position is not what comes back.
  it.each(each)(
    "%s numbers its sections and items explicitly",
    (_id, template) => {
      template.sections.forEach((section, index) => {
        expect(section.sort_order).toBe(index + 1);
        section.items.forEach((item, itemIndex) => {
          expect(item.sort_order).toBe(itemIndex + 1);
        });
      });
    },
  );
});
