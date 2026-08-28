import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeafEditor } from "@/features/actors/presentation/leaf-editor";
import { offerableLeafKinds } from "@/features/actors/domain/required-blocks";
import type { LeafBlock } from "@/features/actors/domain/block-schema";
import { blockEditorLabels } from "./support/editor-labels";

const labels = blockEditorLabels().leaf;

const leaf: LeafBlock = {
  kind: "text",
  title_en: "A title",
  description_en: "",
};

/**
 * The values the kind select offers, in the order it offers them.
 *
 * Reads `value` rather than the visible label, because the label is a
 * translated string and this is a test about the vocabulary.
 *
 * @returns every option value, enabled and disabled alike.
 */
function offeredKinds(): string[] {
  const select = screen.getByRole("combobox", { name: labels.leafKind });
  return [...select.querySelectorAll("option")].map((one) => one.value);
}

describe("the leaf-kind select offers only what the page may hold", () => {
  it("withholds `owner` on a person's page", () => {
    render(
      <LeafEditor
        leaf={leaf}
        path={[0, 0]}
        apply={() => {}}
        lang="en"
        labels={labels}
        problems={[]}
        dragHandle={null}
        kinds={offerableLeafKinds("person")}
      />,
    );
    expect(offeredKinds()).not.toContain("owner");
    // The positive half, so the negative one cannot pass by rendering nothing
    // — an empty select would satisfy every `not.toContain` in this file.
    expect(offeredKinds()).toContain("fursonas");
    expect(offeredKinds()).toContain("text");
  });

  it("withholds `fursonas` on a fursona's page", () => {
    render(
      <LeafEditor
        leaf={leaf}
        path={[0, 0]}
        apply={() => {}}
        lang="en"
        labels={labels}
        problems={[]}
        dragHandle={null}
        kinds={offerableLeafKinds("fursona")}
      />,
    );
    expect(offeredKinds()).not.toContain("fursonas");
    expect(offeredKinds()).toContain("owner");
  });

  it("still shows a stored kind this build cannot offer, disabled", () => {
    render(
      <LeafEditor
        leaf={{ ...leaf, kind: "from-a-newer-build" }}
        path={[0, 0]}
        apply={() => {}}
        lang="en"
        labels={labels}
        problems={[]}
        dragHandle={null}
        kinds={offerableLeafKinds("fursona")}
      />,
    );
    const option = screen.getByRole("option", { name: "from-a-newer-build" });
    expect(option).toBeDisabled();
  });
});
