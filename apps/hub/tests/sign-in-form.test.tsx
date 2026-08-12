import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const sso = vi.fn();
let fetchStatus: "idle" | "fetching" = "idle";

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({ signIn: { sso }, fetchStatus, errors: null }),
}));

const { SignInForm } = await import("@/features/session");

const LABELS = {
  discord: "Continuar con Discord",
  google: "Continuar con Google",
  facebook: "Continuar con Facebook",
};

/**
 * Renders the form with the arguments a page would pass.
 *
 * @returns nothing.
 */
const renderForm = () =>
  render(
    <SignInForm
      callbackUrl="/es/sign-in/sso-callback"
      afterSignInUrl="/es/me"
      labels={LABELS}
      errorLabel="No pudimos abrir esa opción."
    />,
  );

beforeEach(() => {
  sso.mockReset();
  sso.mockResolvedValue({ error: null });
  fetchStatus = "idle";
});

describe("SignInForm", () => {
  it("offers every configured provider", () => {
    renderForm();
    expect(screen.getByTestId("sign-in-discord")).toBeInTheDocument();
    expect(screen.getByTestId("sign-in-google")).toBeInTheDocument();
    expect(screen.getByTestId("sign-in-facebook")).toBeInTheDocument();
  });

  // Discord is the only connection production launches with, so it must not be
  // buried below the two that arrive later.
  it("puts Discord first", () => {
    renderForm();
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAttribute("data-testid", "sign-in-discord");
  });

  it("labels each button from the catalogue rather than hardcoding", () => {
    renderForm();
    expect(
      screen.getByRole("button", { name: /Continuar con Discord/ }),
    ).toBeInTheDocument();
  });

  it("hands off to the provider with the callback and destination", async () => {
    renderForm();
    screen.getByTestId("sign-in-google").click();
    await vi.waitFor(() =>
      expect(sso).toHaveBeenCalledWith({
        strategy: "oauth_google",
        redirectUrl: "/es/me",
        redirectCallbackUrl: "/es/sign-in/sso-callback",
      }),
    );
  });

  // `sso()` resolves with an error rather than throwing, so a try/catch alone
  // would treat a failed hand-off as a success and leave the page unchanged
  // with no explanation.
  it("reports a returned error", async () => {
    sso.mockResolvedValue({ error: { code: "oauth_error" } });
    renderForm();
    screen.getByTestId("sign-in-discord").click();
    expect(await screen.findByTestId("sign-in-error")).toBeVisible();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("reports a thrown error too", async () => {
    sso.mockRejectedValue(new Error("network down"));
    renderForm();
    screen.getByTestId("sign-in-discord").click();
    expect(await screen.findByTestId("sign-in-error")).toBeVisible();
  });

  it("says nothing about errors before anything has failed", () => {
    renderForm();
    expect(screen.queryByTestId("sign-in-error")).toBeNull();
  });

  // Clerk's detail names strategies and instance configuration. None of it
  // helps the person reading the page, and some of it should not be shown.
  it("does not leak the provider error detail", async () => {
    sso.mockResolvedValue({ error: { code: "oauth_access_denied" } });
    renderForm();
    screen.getByTestId("sign-in-discord").click();
    await screen.findByTestId("sign-in-error");
    expect(screen.queryByText(/oauth_access_denied/)).toBeNull();
  });

  it("disables the buttons while Clerk is still fetching", () => {
    fetchStatus = "fetching";
    renderForm();
    expect(screen.getByTestId("sign-in-discord")).toBeDisabled();
  });

  it("is keyboard reachable and submits no form", () => {
    renderForm();
    for (const button of screen.getAllByRole("button")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button).toHaveAttribute("type", "button");
    }
  });
});
