import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const signOut = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut }),
}));

const { SignOutControl } = await import("@/components/sign-out-button");

describe("SignOutControl", () => {
  it("renders the label it is given, not a hardcoded one", () => {
    render(<SignOutControl label="Cerrar sesión" redirectUrl="/es" />);
    expect(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
  });

  it("is a real button, so it is keyboard reachable and submits nothing", () => {
    render(<SignOutControl label="Sign out" redirectUrl="/en" />);
    const button = screen.getByRole("button");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  // The destination is the whole point of wrapping Clerk's helper: a bare
  // signOut() lets Clerk choose, which has already landed this app on a
  // Clerk-branded address once.
  it("signs out to the locale it was given", () => {
    signOut.mockClear();
    render(<SignOutControl label="Cerrar sesión" redirectUrl="/es" />);
    screen.getByRole("button").click();
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/es" });
  });

  it("keeps an English visitor on the English home page", () => {
    signOut.mockClear();
    render(<SignOutControl label="Sign out" redirectUrl="/en" />);
    screen.getByRole("button").click();
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/en" });
  });

  it("does not sign out until it is activated", () => {
    signOut.mockClear();
    render(<SignOutControl label="Sign out" redirectUrl="/en" />);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("carries the test id the e2e suite selects by", () => {
    render(<SignOutControl label="Sign out" redirectUrl="/en" />);
    expect(screen.getByTestId("sign-out")).toBeInTheDocument();
  });
});
