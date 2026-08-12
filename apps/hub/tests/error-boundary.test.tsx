import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import AppError from "@/app/[locale]/(app)/error";
import en from "@/shared/infrastructure/i18n/messages/en.json";
import es from "@/shared/infrastructure/i18n/messages/es.json";

const dbFailure = Object.assign(
  new Error("permission denied for view actors_public"),
  { digest: "abc123" },
);

/**
 * Renders the boundary with a real catalogue.
 *
 * The real messages rather than a stub, so this also fails if a key is
 * removed from the catalogue — a stub would keep passing while the page
 * rendered raw key names at people.
 *
 * @param messages - the catalogue to render with.
 * @param locale - the locale that catalogue belongs to.
 * @param reset - the retry callback.
 * @returns nothing.
 */
const renderWith = (
  messages: typeof en,
  locale: string,
  reset = vi.fn(),
): void => {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppError error={dbFailure} reset={reset} />
    </NextIntlClientProvider>,
  );
};

describe("the signed-in error boundary", () => {
  it("says the identity could not be loaded rather than rendering a blank one", () => {
    renderWith(en, "en");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/could not load your identity/i)).toBeVisible();
  });

  it("offers a retry that re-runs the failed render", () => {
    const reset = vi.fn();
    renderWith(en, "en", reset);
    screen.getByRole("button", { name: /try again/i }).click();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // The message can carry schema names, policy names and connection strings.
  // Support needs the digest; the person signing in does not need the rest.
  it("does not leak the underlying database error to the person", () => {
    renderWith(en, "en");
    expect(
      screen.queryByText(/permission denied for view actors_public/i),
    ).toBeNull();
    expect(screen.getByText(/abc123/)).toBeVisible();
  });

  // Asserted per locale rather than once: the guard is that the raw message is
  // never rendered, and that has to hold on every page a person can reach, not
  // only the English one.
  it("does not leak the underlying database error in Spanish either", () => {
    renderWith(es, "es");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/no pudimos cargar tu identidad/i)).toBeVisible();
    expect(
      screen.queryByText(/permission denied for view actors_public/i),
    ).toBeNull();
  });

  // next-intl renders the key itself when a message is missing, so this is
  // what catches a catalogue that lost a key the boundary depends on.
  it("renders no raw message keys in either language", () => {
    renderWith(en, "en");
    expect(screen.queryByText(/^error\./)).toBeNull();
    renderWith(es, "es");
    expect(screen.queryByText(/^error\./)).toBeNull();
  });
});
