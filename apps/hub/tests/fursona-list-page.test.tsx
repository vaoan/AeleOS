import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const listMyActors = vi.fn<(...a: unknown[]) => unknown>();
const ensurePersonActor = vi.fn<(...a: unknown[]) => unknown>(() =>
  Promise.resolve("person-ref"),
);

// Card comes from page-shell, whose module top level pulls in LanguageToggle ->
// createNavigation() against the real "next/navigation". Stub the wrapper so
// that call never happens; "a" renders the create link as a plain anchor,
// which is all this suite needs to see whether it was offered.
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: "a",
  redirect: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
  getPathname: vi.fn(),
}));
// The translator returns the key, so an assertion names the message it means
// rather than a sentence that would move the moment the copy is reworded.
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock("@/features/actors", () => ({
  listMyActors: (...a: unknown[]) => listMyActors(...a),
  ensurePersonActor: (...a: unknown[]) => ensurePersonActor(...a),
  // Enough of a tile to be found by the handle it was given, and to show
  // whether the page decided to offer an edit link — the real component is
  // presentation and excluded from coverage; what matters here is which rows,
  // and which affordances, the page decided to render at all.
  ActorTile: ({
    actor,
    edit,
  }: {
    actor: { handle: string };
    edit?: { label: string };
  }) => (
    <li>
      {actor.handle}
      {edit ? <a>{edit.label}</a> : null}
    </li>
  ),
}));

const { default: FursonasPage } =
  await import("@/app/[locale]/(app)/fursonas/page");

/**
 * An actor row as `listMyActors` would return it, with overrides.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
function actor(over: Partial<Record<string, unknown>> = {}) {
  return {
    actorRef: "ref-p",
    kind: "person",
    handle: "u-abc",
    displayName: null,
    avatarUrl: null,
    visibility: "private",
    status: "active",
    ...over,
  };
}

const person = actor();
const sona = actor({
  actorRef: "ref-s",
  kind: "fursona",
  handle: "sparky",
});

beforeEach(() => {
  vi.clearAllMocks();
  ensurePersonActor.mockResolvedValue("person-ref");
});

describe("FursonasPage", () => {
  // F2's invariant, made true rather than asserted. The page used to rely on
  // /me having rendered first to guarantee a person row; somebody arriving
  // from another app straight at /fursonas never opens /me.
  it("provisions the person actor before reading the list", async () => {
    listMyActors.mockResolvedValueOnce([person]);
    render(await FursonasPage());

    expect(ensurePersonActor).toHaveBeenCalledOnce();
    expect(ensurePersonActor.mock.invocationCallOrder[0]!).toBeLessThan(
      listMyActors.mock.invocationCallOrder[0]!,
    );
  });

  it("renders every actor when there are fursonas", async () => {
    listMyActors.mockResolvedValueOnce([person, sona]);
    render(await FursonasPage());

    expect(screen.getByText("u-abc")).toBeInTheDocument();
    expect(screen.getByText("sparky")).toBeInTheDocument();
    expect(screen.queryByText("empty")).not.toBeInTheDocument();
  });

  it("says the list is empty when only the person row comes back", async () => {
    listMyActors.mockResolvedValueOnce([person]);
    render(await FursonasPage());

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  // `=== 1` left this case rendering a heading, a subtitle, a create link and
  // no message at all — the one state where the page said nothing.
  it("says the list is empty when no actors come back at all", async () => {
    listMyActors.mockResolvedValueOnce([]);
    render(await FursonasPage());

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  // F1. A suspended person's fursonas are filtered out by my_actors, leaving
  // exactly one row — indistinguishable by count from "no fursonas yet", and
  // the wrong thing to say.
  it("tells a suspended person why the list is short, not that they have none", async () => {
    listMyActors.mockResolvedValueOnce([actor({ status: "suspended" })]);
    render(await FursonasPage());

    expect(screen.getByText("suspended")).toBeInTheDocument();
    expect(screen.queryByText("empty")).not.toBeInTheDocument();
  });

  // create_fursona raises `person actor is suspended`, which would arrive as
  // the generic error boundary. An action that can only fail is worse than no
  // action offered.
  it("offers a suspended person no way to create a fursona", async () => {
    listMyActors.mockResolvedValueOnce([actor({ status: "suspended" })]);
    render(await FursonasPage());

    expect(screen.queryByText("create")).not.toBeInTheDocument();
  });

  // F1 reads actors[0]'s status, not any row's: my_actors() puts the person
  // first, and a suspended fursona is a real, anticipated state for an
  // otherwise-active owner (the edit-link guard three lines below exists
  // because of it). Every other suspension fixture above is a single-row
  // list, which can't tell "the person is suspended" apart from "something
  // in the list is suspended" — this is the case that can.
  it("does not mistake an active person's suspended fursona for their own suspension", async () => {
    listMyActors.mockResolvedValueOnce([
      person,
      actor({ ...sona, status: "suspended" }),
    ]);
    render(await FursonasPage());

    expect(screen.queryByText("suspended")).not.toBeInTheDocument();
    expect(screen.getByText("create")).toBeInTheDocument();
    expect(screen.getByText("sparky")).toBeInTheDocument();
    expect(screen.queryByText("edit")).not.toBeInTheDocument();
  });

  it("offers the create link to an active person", async () => {
    listMyActors.mockResolvedValueOnce([person]);
    render(await FursonasPage());

    expect(screen.getByText("create")).toBeInTheDocument();
  });

  // The distinction listMyActors' own doc comment exists to protect: a failed
  // read must not render as "you have no fursonas", which invites the person
  // to create a duplicate of one they already have.
  it("lets a listMyActors failure propagate rather than rendering an empty list", async () => {
    listMyActors.mockRejectedValueOnce(new Error("Could not read your actors"));
    await expect(FursonasPage()).rejects.toThrow(/Could not read your actors/);
  });
});
