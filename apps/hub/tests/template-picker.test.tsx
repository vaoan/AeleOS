import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";
import { TemplatePicker } from "@/features/actors/presentation/template-picker";

const labels = {
  useTemplate: "Start from a template",
  templateConfirm: "This replaces the sections you have. Are you sure?",
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
      `${template.sections.length} sections in ${template.id}`,
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
    expect(onApply.mock.calls[0]![0]).toEqual(first.sections);
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

    const given = onApply.mock.calls[0]![0] as typeof first.sections;
    given[0]!.name_en = "rewritten";
    given[0]!.items[0]!.title_en = "rewritten too";

    expect(FURSONA_TEMPLATES[0]!.sections[0]!.name_en).not.toBe("rewritten");
    expect(FURSONA_TEMPLATES[0]!.sections[0]!.items[0]!.title_en).not.toBe(
      "rewritten too",
    );
  });
});
