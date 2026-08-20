import { describe, expect, it, vi } from "vitest";
import { pageContext } from "./helpers/page-context";
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

const BLOCKS = [
  {
    kind: "container",
    mode: "stack",
    spaces: 1,
    name_en: "About",
    children: [
      { kind: "text", title_en: "Species", description_en: "A wolf." },
    ],
  },
] as unknown as PublicActor["blocks"];

/** An actor with the given fields replaced. */
const actor = (over: Partial<PublicActor> = {}): PublicActor => ({
  handle: "luna",
  displayName: "Luna",
  avatarUrl: null,
  address: "42",
  listed: true,
  blocks: BLOCKS,
  theme: DEFAULT_THEME,
  ...over,
});

/**
 * **This suite shrank on 2026-08-19, and almost nothing was deleted.**
 *
 * `PublicProfile` used to render a portrait, a display name, a handle, a
 * fursona list, an empty state and a theme switch as chrome around the blocks.
 * Every one of those is now either a leaf kind or a control in the page bar,
 * so the assertions moved with the behaviour rather than being dropped:
 *
 *  * the portrait, the display name, the handle and the owner link →
 *    `identity-leaves.test.tsx`, which also keeps the guard that a person's
 *    provisioned `u-` handle never reaches a stranger;
 *  * the fursona list, including the empty-list case →
 *    `identity-leaves.test.tsx`'s `FursonasLeaf` describe;
 *  * "a header appears even when they wrote nothing" →
 *    `required-blocks.test.ts`, which is where the shim that supplies it lives,
 *    and `public-actors.test.ts`, which proves the read applies it;
 *  * the theme switch → `page-shell.test.tsx`.
 *
 * The empty state has no new home because it no longer exists: its condition
 * — no blocks at all — cannot be true once every page is guaranteed a portrait
 * and a handle. See the component's own note.
 *
 * What is left here is the one claim this component still makes.
 */
describe("PublicProfile", () => {
  it("renders the tree it is given", () => {
    render(
      <PublicProfile
        actor={actor()}
        locale="en"
        page={pageContext({ parentHost: "me.furrycolombia.com" })}
      />,
    );
    expect(screen.getByText("Species")).toBeInTheDocument();
    expect(screen.getByText("A wolf.")).toBeInTheDocument();
  });

  // **It reads nothing out of the actor except the blocks.** That is what
  // makes one renderer serve both public pages — there is no shape left in
  // this component that could differ between them. A fixture whose actor
  // carried a display name and an avatar would pass whether or not the
  // component still drew them, so this one carries neither.
  it("draws no chrome of its own around them", () => {
    const { container } = render(
      <PublicProfile
        actor={actor({
          displayName: "Luna",
          avatarUrl: "https://x.test/a.png",
        })}
        locale="en"
        page={pageContext()}
      />,
    );
    expect(container.querySelector("header")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByText("Luna")).not.toBeInTheDocument();
  });

  it("passes the locale down, so a block renders in the language asked for", () => {
    const bilingual = [
      {
        kind: "container",
        mode: "stack",
        spaces: 1,
        children: [
          {
            kind: "text",
            title_en: "Species",
            title_es: "Especie",
            description_en: "A wolf.",
            description_es: "Un lobo.",
          },
        ],
      },
    ] as unknown as PublicActor["blocks"];
    render(
      <PublicProfile
        actor={actor({ blocks: bilingual })}
        locale="es"
        page={pageContext()}
      />,
    );
    expect(screen.getByText("Un lobo.")).toBeInTheDocument();
  });
});
