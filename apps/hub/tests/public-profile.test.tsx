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

// One section: a container at depth 0 that carries a name, which is what the
// heading assertions below read.
const BLOCKS = [
  {
    kind: "container",
    mode: "stack",
    spaces: 1,
    name_en: "About",
    children: [
      {
        kind: "stat",
        title_en: "Species",
        description_en: "A wolf.",
      },
    ],
  },
] as unknown as PublicActor["blocks"];

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
  blocks: BLOCKS,
  ...over,
});

/**
 * Renders a profile.
 *
 * `parentHost` is route-resolved config nothing in this file exercises —
 * only a `player` leaf reads it, for Twitch, which no test here embeds — so it
 * is a fixed stand-in value rather than a parameter.
 *
 * @param over - fields to replace on the actor.
 * @param locale - the locale being read.
 */
function renderProfile(
  over: Partial<PublicActor> = {},
  locale = "en",
  themeSwitch?: React.ReactNode,
): void {
  render(
    <PublicProfile
      actor={actor(over)}
      locale={locale}
      fursonasTitle="Fursonas"
      emptyMessage="Nothing here yet."
      themeSwitch={themeSwitch}
      parentHost="me.furrycolombia.com"
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

  // WHERE it renders is the assertion, not whether. It sat alone above the
  // page, which read as furniture nobody had written a heading for and pushed
  // the portrait down by its own height; both routes now hand it here so it is
  // level with the picture. Asserting only that it appears somewhere would
  // pass with it back where it was.
  describe("the theme switch", () => {
    it("rides the header, level with the portrait", () => {
      renderProfile({}, "en", <button type="button">Theme</button>);
      const header = document.querySelector("header");
      expect(header).toContainElement(
        screen.getByRole("button", { name: "Theme" }),
      );
    });

    // Absent is the ordinary case: an unthemed page has no theme to leave, and
    // the routes pass nothing at all rather than an empty box.
    it("leaves no empty box behind when there is none", () => {
      renderProfile();
      expect(
        screen.queryByTestId("public-theme-switch"),
      ).not.toBeInTheDocument();
    });
  });

  it("renders what they wrote", () => {
    renderProfile();
    expect(
      screen.getByRole("heading", { name: "About", level: 2 }),
    ).toBeInTheDocument();
  });

  it("renders a header and nothing else when they wrote nothing", () => {
    renderProfile({ blocks: [] });
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

describe("a person whose handle nobody chose", () => {
  // **THE REGRESSION TEST for `actor_ref` on a public page.** Provisioning
  // mints `u-<actor_ref with the hyphens out>` because a handle is `not null`
  // and nobody has picked one yet, and this page printed it under the name —
  // so a stranger reading somebody's profile was handed the reference that IS
  // the `owner_ref` of every fursona they own, the exact column
  // `/api/actors/mine` strips by name.
  //
  // Found by looking at a real published profile. Every test here passed
  // throughout, because they all used the handle `luna`, which a person never
  // has.
  const machine = "u-78797f558e275eb3b3254726f43f1667";

  it("shows their address instead of the reference", () => {
    render(
      <PublicProfile
        actor={actor({ handle: machine, address: "15" })}
        emptyMessage="Nothing here yet."
        locale="en"
        fursonasTitle="Fursonas"
        parentHost="me.furrycolombia.com"
      />,
    );
    expect(screen.queryByText(machine)).toBeNull();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  // The heading falls back to the handle when nobody has set a name, so it
  // leaked through the title as well as the subtitle.
  it("titles the page with their address when they set no name", () => {
    render(
      <PublicProfile
        actor={actor({ handle: machine, address: "15", displayName: null })}
        emptyMessage="Nothing here yet."
        locale="en"
        fursonasTitle="Fursonas"
        parentHost="me.furrycolombia.com"
      />,
    );
    expect(screen.getByTestId("public-actor-name")).toHaveTextContent("15");
    expect(screen.queryByText(machine)).toBeNull();
  });

  // A fursona's handle is chosen, is in its address, and must keep showing.
  it("still shows a handle somebody chose", () => {
    render(
      <PublicProfile
        actor={actor({ handle: "luna", address: "15" })}
        emptyMessage="Nothing here yet."
        locale="en"
        fursonasTitle="Fursonas"
        parentHost="me.furrycolombia.com"
      />,
    );
    expect(screen.getByText("luna")).toBeInTheDocument();
  });
});

describe("a page with nothing on it", () => {
  // **A published profile with nothing written on it was a screen of empty
  // gradient.** Correct — no blocks and no public fursonas is exactly what it
  // says — but a stranger has no way to tell a page still being built from one
  // that failed to load, and its owner has no way to tell publishing worked.
  //
  // The words are for the VISITOR, not the owner. This is an anonymous read and
  // the page cannot know who is looking, so it must not tell somebody to go and
  // add something — most people seeing it are not the person who could.
  it("says so when there is nothing to show", () => {
    renderProfile({ blocks: [], fursonas: [] });
    expect(screen.getByTestId("public-empty")).toHaveTextContent(
      "Nothing here yet.",
    );
  });

  // A fursona's page carries no fursona list at all, so the absent key and the
  // empty list have to mean the same thing here.
  it("says so on a fursona's own page too", () => {
    renderProfile({ blocks: [], fursonas: undefined });
    expect(screen.getByTestId("public-empty")).toBeInTheDocument();
  });

  it("stays away once there is something written", () => {
    renderProfile({ fursonas: [] });
    expect(screen.queryByTestId("public-empty")).toBeNull();
  });

  // **A person with no blocks but a public fursona is not empty.** The list
  // is the page, and hiding it behind "nothing here yet" would be worse than
  // the blank screen this replaces.
  it("stays away when the only content is the fursona list", () => {
    renderProfile({
      blocks: [],
      fursonas: [{ handle: "shadow", displayName: "Shadow", avatarUrl: null }],
    });
    expect(screen.queryByTestId("public-empty")).toBeNull();
    expect(screen.getByText("Shadow")).toBeInTheDocument();
  });
});
