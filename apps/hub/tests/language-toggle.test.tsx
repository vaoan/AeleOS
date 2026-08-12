import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const replace = vi.fn();
let locale = "es";

vi.mock("next/navigation", () => ({ useParams: () => ({ locale }) }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/sign-in",
}));

const { LanguageToggle } = await import("@/components/language-toggle");

beforeEach(() => {
  replace.mockReset();
  locale = "es";
});

describe("LanguageToggle", () => {
  // Shows the destination, like every other control here. Showing the current
  // language makes it read as a status rather than a button.
  it("shows the language it will switch to", () => {
    render(<LanguageToggle label="Cambiar idioma" />);
    expect(screen.getByTestId("language-toggle")).toHaveTextContent("en");
  });

  it("shows the other direction from English", () => {
    locale = "en";
    render(<LanguageToggle label="Change language" />);
    expect(screen.getByTestId("language-toggle")).toHaveTextContent("es");
  });

  // The whole point: land on the same page in the other language. Sending
  // people home is what makes a language switch feel broken.
  it("keeps you on the same page", () => {
    render(<LanguageToggle label="Cambiar idioma" />);
    screen.getByRole("button").click();
    expect(replace).toHaveBeenCalledWith("/sign-in", { locale: "en" });
  });

  // `replace`, not `push`: otherwise the back button walks through every
  // language the visitor tried.
  it("replaces rather than pushing history", () => {
    render(<LanguageToggle label="Cambiar idioma" />);
    screen.getByRole("button").click();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("carries an accessible name, since the label is two letters", () => {
    render(<LanguageToggle label="Cambiar idioma" />);
    expect(
      screen.getByRole("button", { name: "Cambiar idioma" }),
    ).toBeInTheDocument();
  });

  it("does not navigate until pressed", () => {
    render(<LanguageToggle label="Cambiar idioma" />);
    expect(replace).not.toHaveBeenCalled();
  });
});
