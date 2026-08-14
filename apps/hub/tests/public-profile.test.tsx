import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import type { PublicActor } from "@/features/actors/infrastructure/public-actors";

// The locale-aware Link needs intl context, which a component test has no
// business standing up. Every other suite here mocks it the same way.
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["sparkles"],
}));

const { PublicProfile } =
  await import("@/features/actors/presentation/public-profile");

const SECTIONS = [
  {
    name_en: "About",
    type: "cards",
    sort_order: 1,
    items: [{ title_en: "Species", description_en: "A wolf.", sort_order: 1 }],
  },
] as unknown as PublicActor["sections"];

/**
 * An actor, with overrides.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
const actor = (over: Partial<PublicActor> = {}): PublicActor => ({
  handle: "luna",
  displayName: "Luna",
  avatarUrl: "https://example.test/a.png",
  address: "42",
  theme: DEFAULT_THEME,
  listed: true,
  sections: SECTIONS,
  ...over,
});

/**
 * Renders a profile.
 *
 * @param over - fields to replace on the actor.
 * @param locale - the locale being read.
 */
function renderProfile(over: Partial<PublicActor> = {}, locale = "en"): void {
  render(
    <PublicProfile
      actor={actor(over)}
      locale={locale}
      fursonasTitle="Fursonas"
    />,
  );
}

describe("PublicProfile", () => {
  it("heads the page with the display name", () => {
    renderProfile();
    expect(
      screen.getByRole("heading", { name: "Luna", level: 1 }),
    ).toBeInTheDocument();
  });

  // A page titled with an empty string is worse than one titled with a machine
  // name, and every actor has a handle by construction.
  it("falls back to the handle when no display name is set", () => {
    renderProfile({ displayName: null });
    expect(
      screen.getByRole("heading", { name: "luna", level: 1 }),
    ).toBeInTheDocument();
  });

  it("shows the avatar, described by nothing", () => {
    renderProfile();
    // Decorative: the heading beside it already names the actor, so a filled
    // alt would make a screen reader say the name twice.
    const image = document.querySelector("header img");
    expect(image).toHaveAttribute("src", "https://example.test/a.png");
    expect(image).toHaveAttribute("alt", "");
  });

  it("shows a placeholder when there is no avatar", () => {
    renderProfile({ avatarUrl: null });
    expect(document.querySelector("header img")).toBeNull();
  });

  it("renders what they wrote", () => {
    renderProfile();
    expect(
      screen.getByRole("heading", { name: "About", level: 2 }),
    ).toBeInTheDocument();
  });

  it("renders a header and nothing else when they wrote nothing", () => {
    renderProfile({ sections: [] });
    expect(
      screen.getByRole("heading", { name: "Luna", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  // THE ONE DIFFERENCE between the two pages. readPublicFursona returns no
  // list, so a fursona's page has nothing to draw there — the same component
  // serves both, which is what makes "a person's profile has the same shape as
  // a fursona's" true rather than merely intended.
  describe("the fursona list", () => {
    it("is absent on a fursona's own page", () => {
      renderProfile();
      expect(screen.queryByRole("heading", { name: "Fursonas" })).toBeNull();
    });

    it("appears on a person's page", () => {
      renderProfile({
        fursonas: [{ handle: "luna", displayName: "Luna", avatarUrl: null }],
      });
      expect(
        screen.getByRole("heading", { name: "Fursonas", level: 2 }),
      ).toBeInTheDocument();
    });

    // A heading over an empty space is worse than no heading. Somebody with no
    // published characters has a profile about themselves, not one with a gap.
    it("stays absent when the person has published none", () => {
      renderProfile({ fursonas: [] });
      expect(screen.queryByRole("heading", { name: "Fursonas" })).toBeNull();
    });

    it("links each one under the owner's address", () => {
      renderProfile({
        fursonas: [{ handle: "luna", displayName: "Luna", avatarUrl: null }],
      });
      expect(screen.getByRole("link", { name: /Luna/ })).toHaveAttribute(
        "href",
        "/42/luna",
      );
    });

    it("falls back to the handle when a fursona has no display name", () => {
      renderProfile({
        fursonas: [{ handle: "shadow", displayName: null, avatarUrl: null }],
      });
      expect(screen.getByRole("link", { name: /shadow/ })).toBeInTheDocument();
    });

    it("shows an avatar when one is set", () => {
      renderProfile({
        fursonas: [
          {
            handle: "luna",
            displayName: "Luna",
            avatarUrl: "https://example.test/f.png",
          },
        ],
      });
      expect(
        document.querySelector('img[src="https://example.test/f.png"]'),
      ).not.toBeNull();
    });
  });
});
