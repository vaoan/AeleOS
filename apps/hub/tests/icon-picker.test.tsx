import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Mocked so the test is about the picker rather than about lucide's catalogue,
// which is ~1500 names and changes with the dependency. The real module is only
// ever proved by `pnpm --filter hub build`.
vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["sparkles", "heart", "star", "home", "zap"],
}));

const { IconPicker } =
  await import("@/features/actors/presentation/icon-picker");

const labels = {
  chooseIcon: "Choose an icon",
  searchIcons: "Search icons",
  noIconsFound: "No icons match that.",
  clearIcon: "Remove the icon",
  noIcon: "No icon",
};

/**
 * Renders the picker.
 *
 * @param value - the currently stored icon name.
 * @returns the change spy.
 */
function renderPicker(value = "heart"): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  render(<IconPicker value={value} onChange={onChange} labels={labels} />);
  return onChange;
}

/** Opens the panel. */
const open = () =>
  fireEvent.click(screen.getByRole("button", { name: labels.chooseIcon }));

describe("IconPicker", () => {
  it("shows the stored icon on the trigger", () => {
    renderPicker();
    expect(document.querySelector('[data-icon="heart"]')).not.toBeNull();
  });

  // `icon` is free text as far as 0013 is concerned. Handing DynamicIcon a name
  // it does not have is how a stored value from anywhere else takes the editor
  // down, so the value is checked before it is passed, not after.
  it("shows nothing for a stored name that is not an icon", () => {
    renderPicker("NotAnIcon");
    expect(document.querySelector('[data-icon="NotAnIcon"]')).toBeNull();
    expect(screen.getByText(labels.noIcon)).toBeInTheDocument();
  });

  it("shows nothing when no icon is stored", () => {
    renderPicker("");
    expect(screen.getByText(labels.noIcon)).toBeInTheDocument();
  });

  it("keeps the panel closed until it is asked for", () => {
    renderPicker();
    expect(screen.queryByLabelText(labels.searchIcons)).toBeNull();
    expect(
      screen.getByRole("button", { name: labels.chooseIcon }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the panel", () => {
    renderPicker();
    open();
    expect(screen.getByLabelText(labels.searchIcons)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: labels.chooseIcon }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("closes again on a second press", () => {
    renderPicker();
    open();
    open();
    expect(screen.queryByLabelText(labels.searchIcons)).toBeNull();
  });

  it("narrows the grid as somebody searches", () => {
    renderPicker();
    open();
    fireEvent.change(screen.getByLabelText(labels.searchIcons), {
      target: { value: "st" },
    });
    expect(screen.getByRole("button", { name: "star" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "heart" })).toBeNull();
  });

  it("says so when a search matches nothing", () => {
    renderPicker();
    open();
    fireEvent.change(screen.getByLabelText(labels.searchIcons), {
      target: { value: "nothing matches this" },
    });
    expect(screen.getByText(labels.noIconsFound)).toBeInTheDocument();
  });

  it("reports the chosen icon and closes", () => {
    const onChange = renderPicker();
    open();
    fireEvent.click(screen.getByRole("button", { name: "star" }));
    expect(onChange).toHaveBeenCalledWith("star");
    expect(screen.queryByLabelText(labels.searchIcons)).toBeNull();
  });

  // `icon` is optional, so there has to be a way back to none. Without one the
  // field becomes permanent the moment somebody touches it once.
  it("clears the icon", () => {
    const onChange = renderPicker();
    open();
    fireEvent.click(screen.getByRole("button", { name: labels.clearIcon }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("forgets the search when it closes", () => {
    renderPicker();
    open();
    fireEvent.change(screen.getByLabelText(labels.searchIcons), {
      target: { value: "st" },
    });
    open();
    open();
    expect(screen.getByLabelText(labels.searchIcons)).toHaveValue("");
  });

  it("closes on Escape without choosing anything", () => {
    const onChange = renderPicker();
    open();
    fireEvent.keyDown(screen.getByLabelText(labels.searchIcons), {
      key: "Escape",
    });
    expect(screen.queryByLabelText(labels.searchIcons)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    renderPicker();
    open();
    fireEvent.keyDown(screen.getByLabelText(labels.searchIcons), {
      key: "ArrowDown",
    });
    expect(screen.getByLabelText(labels.searchIcons)).toBeInTheDocument();
  });
});
