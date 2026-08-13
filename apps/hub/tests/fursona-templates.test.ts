import { describe, expect, it } from "vitest";
import { iconNames } from "lucide-react/dynamic";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";
import { sectionsSchema } from "@/features/actors/domain/section-schema";

const each = FURSONA_TEMPLATES.map(
  (template) => [template.id, template] as const,
);

describe("FURSONA_TEMPLATES", () => {
  it("ships templates at all", () => {
    expect(FURSONA_TEMPLATES.length).toBeGreaterThan(0);
  });

  // The id is the catalogue key for the name and the description, so a
  // duplicate would silently give two templates one label.
  it("gives every template a distinct id", () => {
    const ids = FURSONA_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The guard that matters. sectionItemSchema requires a non-empty title and
  // description, so a template of empty scaffolding would be refused by our own
  // editor the moment somebody pressed Save — found by them, not by us.
  it.each(each)(
    "%s parses as sections the editor would accept",
    (_id, template) => {
      expect(() => sectionsSchema.parse(template.sections)).not.toThrow();
    },
  );

  // We are the author until the moment a template is applied, so we owe both
  // languages. After it is applied the words are the person's and a missing
  // Spanish is simply one they have not written.
  it.each(each)(
    "%s writes every seeded string in both languages",
    (_id, template) => {
      for (const section of template.sections) {
        expect(section.name_en).toBeTruthy();
        expect(section.name_es).toBeTruthy();
        for (const item of section.items) {
          expect(item.title_en).toBeTruthy();
          expect(item.title_es).toBeTruthy();
          expect(item.description_en).toBeTruthy();
          expect(item.description_es).toBeTruthy();
        }
      }
    },
  );

  // A template that seeds a field its layout will not show is a template that
  // teaches the trap task 2 exists to close.
  it.each(each)(
    "%s seeds icons only on cards and images only on galleries",
    (_id, template) => {
      for (const section of template.sections) {
        for (const item of section.items) {
          if (item.icon) expect(section.type).toBe("cards");
          if (item.image_url !== undefined)
            expect(section.type).toBe("gallery");
        }
      }
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
