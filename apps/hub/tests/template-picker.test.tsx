import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";
import { isContainer, type Block } from "@/features/actors/domain/block-schema";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import { TemplatePicker } from "@/features/actors/presentation/template-picker";

const labels = {
  useTemplate: "Start from a template",
  templateConfirm: "This replaces the sections you have. Are you sure?",
  templateConfirmLook: "Replaces the page and the colours",
  templateConfirmYes: "Replace them",
  templateConfirmNo: "Keep mine",
  names: Object.fromEntries(
    FURSONA_TEMPLATES.map((template) => [
      template.id,
      `Name of ${template.id}`,
    ]),
  ),
  descriptions: Object.fromEntries(
    FURSONA_TEMPLATES.map((template) => [template.id, `About ${template.id}`]),
  ),
  sectionCounts: Object.fromEntries(
    FURSONA_TEMPLATES.map((template) => [
      template.id,
      `${template.blocks.length} sections in ${template.id}`,
    ]),
  ),
};

const first = FURSONA_TEMPLATES[0]!;

/**
 * Renders the picker.
 *
 * @param hasSections - whether the editor already holds sections.
 * @returns the apply spy.
 */
function renderPicker(hasSections = false): ReturnType<typeof vi.fn> {
  const onApply = vi.fn();
  render(
    <TemplatePicker
      hasSections={hasSections}
      labels={labels}
      onApply={onApply}
    />,
  );
  return onApply;
}

/** Opens the list. */
const open = () =>
  fireEvent.click(screen.getByRole("button", { name: labels.useTemplate }));

describe("TemplatePicker", () => {
  it("keeps the list closed until it is asked for", () => {
    renderPicker();
    expect(
      screen.queryByRole("button", { name: labels.names[first.id] }),
    ).toBeNull();
  });

  it("lists every shipped template by name", () => {
    renderPicker();
    open();
    for (const template of FURSONA_TEMPLATES) {
      expect(
        screen.getByRole("button", { name: labels.names[template.id] }),
      ).toBeInTheDocument();
    }
  });

  it("says what each one is and how much it brings", () => {
    renderPicker();
    open();
    expect(
      screen.getByText(labels.descriptions[first.id]!),
    ).toBeInTheDocument();
    expect(
      screen.getByText(labels.sectionCounts[first.id]!),
    ).toBeInTheDocument();
  });

  it("applies at once when there is nothing to lose", () => {
    const onApply = renderPicker(false);
    open();
    fireEvent.click(
      screen.getByRole("button", { name: labels.names[first.id] }),
    );
    expect(onApply).toHaveBeenCalledOnce();
    // **Blocks AND a look**, which is what makes an era look pickable at all.
    // Asserting only the blocks would pass on a picker that silently dropped
    // the theme — the half a template could never carry before.
    expect(onApply.mock.calls[0]![0]).toEqual({
      blocks: first.blocks,
      theme: first.theme,
    });
  });

  // **THE WARNING HAS TO BE TRUE OF THIS TEMPLATE.** Applying a starter
  // touches no colour — every shipped one carries `theme: null` — so a single
  // warning that mentioned colours would be a lie on the ordinary path, and a
  // warning somebody learns is wrong is worse than no warning at all.
  //
  // Both branches are asserted, and the pair is the point: either alone passes
  // on a component that shows one message unconditionally.
  it("warns about the page alone when a template carries no look", () => {
    render(<TemplatePicker hasSections labels={labels} onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId("template-picker"));
    fireEvent.click(
      screen.getByRole("button", { name: labels.names[first.id] }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(labels.templateConfirm);
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      labels.templateConfirmLook,
    );
  });

  it("warns about the colours too when a template carries a look", () => {
    // A themed template does not exist yet — era looks are phase 2 — so this
    // builds one rather than waiting for one. The branch is what needs
    // guarding, and it needs guarding BEFORE something reaches it.
    render(
      <TemplatePicker
        hasSections
        labels={labels}
        onApply={vi.fn()}
        templates={[
          { ...first, theme: { ...DEFAULT_THEME, accent: "#e21233" } },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("template-picker"));
    fireEvent.click(
      screen.getByRole("button", { name: labels.names[first.id] }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      labels.templateConfirmLook,
    );
  });

  // The house pattern, and it is not `globalThis.confirm`: the destructive step
  // is the second click, and a browser dialogue is not ours to style, translate
  // or test.
  it("asks first when there are sections to replace", () => {
    const onApply = renderPicker(true);
    open();
    fireEvent.click(
      screen.getByRole("button", { name: labels.names[first.id] }),
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(labels.templateConfirm)).toBeInTheDocument();
  });

  it("applies once that is confirmed", () => {
    const onApply = renderPicker(true);
    open();
    fireEvent.click(
      screen.getByRole("button", { name: labels.names[first.id] }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: labels.templateConfirmYes }),
    );
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("leaves the sections alone when it is declined", () => {
    const onApply = renderPicker(true);
    open();
    fireEvent.click(
      screen.getByRole("button", { name: labels.names[first.id] }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: labels.templateConfirmNo }),
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByText(labels.templateConfirm)).toBeNull();
  });

  // The only test that can catch a missing clone. A shipped template handed
  // straight to useFieldArray would be rewritten by the first person who edited
  // what it inserted, for everybody else in the session.
  it("hands out a copy, never the shipped array", () => {
    const onApply = renderPicker(false);
    open();
    fireEvent.click(
      screen.getByRole("button", { name: labels.names[first.id] }),
    );

    const given = onApply.mock.calls[0]![0] as {
      blocks: Block[];
      theme: unknown;
    };
    // Narrowed by THROWING rather than by an `if` around the assertion: a
    // conditional `expect` silently passes when its condition is false, which
    // is the one outcome this case must never report as success.
    const section = given.blocks[0];
    if (!section || !isContainer(section))
      throw new Error("expected a section");
    const child = section.children[0];
    if (!child || isContainer(child)) throw new Error("expected a leaf");
    section.name_en = "rewritten";
    child.title_en = "rewritten too";

    const shipped = FURSONA_TEMPLATES[0]!.blocks[0];
    if (!shipped || !isContainer(shipped))
      throw new Error("expected a section");
    const shippedChild = shipped.children[0];
    if (!shippedChild || isContainer(shippedChild)) {
      throw new Error("expected a leaf");
    }
    expect(shipped.name_en).not.toBe("rewritten");
    expect(shippedChild.title_en).not.toBe("rewritten too");
  });
});
