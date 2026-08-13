import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TID_ATTR } from "@/shared/infrastructure/test-id";

const listMyActors = vi.fn<(...a: unknown[]) => unknown>();
const ensurePersonActor = vi.fn<(...a: unknown[]) => unknown>(() =>
  Promise.resolve("person-ref"),
);

// Card comes from page-shell, whose module top level pulls in LanguageToggle ->
// createNavigation() against the real "next/navigation". Stub the wrapper so
// that call never happens.
// The pages hand a client to listMyActors now, so they build one. The real
// builder reaches for Clerk, which no unit test has; the functions under test
// never touch what it returns, because @/features/actors is stubbed.
vi.mock("@/shared/infrastructure/supabase-server", () => ({
  createServerClient: vi.fn(async () => ({})),
}));

vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: "a",
  redirect: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
  getPathname: vi.fn(),
}));
// The translator returns the namespaced key, plus any interpolated values, so
// an assertion names the message it means rather than a sentence that would
// move the moment the copy is reworded — and can still see what was placed
// into the placeholder.
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: string) =>
    Promise.resolve((key: string, values?: Record<string, string>) =>
      values
        ? `${namespace}.${key}:${Object.values(values).join(",")}`
        : `${namespace}.${key}`,
    ),
}));
vi.mock("@/features/actors", () => ({
  listMyActors: (...a: unknown[]) => listMyActors(...a),
  ensurePersonActor: (...a: unknown[]) => ensurePersonActor(...a),
  // Enough of a tile to be found by its handle and to show whether the page
  // decided to offer it as a choice at all. The real component is presentation;
  // what matters here is which rows, and which affordances, the page chose.
  ActorTile: ({
    actor,
    choose,
  }: {
    actor: { actorRef: string; handle: string };
    choose?: { label: string };
  }) => (
    <li>
      {actor.handle}
      {choose ? (
        <button type="submit" name="actor_ref" value={actor.actorRef}>
          {choose.label}
        </button>
      ) : null}
    </li>
  ),
}));
// The real module reaches next/navigation's redirect and the environment. The
// page only ever passes it along as a prop, so a stub identity is all a test
// here could observe anyway — picker-actions.test.ts is where it is exercised.
vi.mock("@/app/[locale]/(app)/picker/actions", () => ({
  chooseActorAction: vi.fn(),
}));
// @/features/picker is deliberately NOT mocked: the origin allowlist is the
// control this page turns on, and a stub would leave it untested here.
vi.mock("@/shared/infrastructure/env", () => ({
  env: { allowedReturnOrigins: ["https://puck.furrycolombia.com"] },
}));

const { default: PickerPage } =
  await import("@/app/[locale]/(app)/picker/page");

const ALLOWED = "https://puck.furrycolombia.com/back";

/**
 * An actor row as `listMyActors` returns it, with overrides.
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
  displayName: "Sparky",
});

/** The picker's query string, typed as Next reports it. */
type PickerQuery = { return_to?: string | string[]; app?: string | string[] };

/**
 * Renders the picker for one set of query parameters.
 *
 * @param query - the search parameters as Next would report them.
 * @returns the render result.
 */
async function renderPicker(query: PickerQuery = {}) {
  return render(await PickerPage({ searchParams: Promise.resolve(query) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  ensurePersonActor.mockResolvedValue("person-ref");
  listMyActors.mockResolvedValue([person, sona]);
});

describe("PickerPage", () => {
  it("refuses when no return_to was given, and offers no tiles", async () => {
    await renderPicker();

    expect(screen.getByText("picker.refused")).toBeInTheDocument();
    expect(screen.getByText("picker.refusedHint")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  // A grid whose every button leads nowhere invites a choice that cannot be
  // honoured — and spends a database read on a request that was never going
  // anywhere.
  it("refuses a return_to that is not on the allowlist, without reading any actors", async () => {
    await renderPicker({ return_to: "https://evil.example/steal" });

    expect(screen.getByText("picker.refused")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(listMyActors).not.toHaveBeenCalled();
    expect(ensurePersonActor).not.toHaveBeenCalled();
  });

  // Echoing the rejected string back would make the hub a place to display an
  // attacker's text under the hub's own name and address.
  it("never echoes the rejected destination back into the page", async () => {
    const { container } = await renderPicker({
      return_to: "https://evil.example/YOUR-ACCOUNT-IS-LOCKED",
    });

    expect(container.innerHTML).not.toContain("evil.example");
    expect(container.innerHTML).not.toContain("YOUR-ACCOUNT-IS-LOCKED");
  });

  // Next reports a repeated query key as an array. Treating it as absent means
  // ?return_to=<allowed>&return_to=<evil> cannot smuggle a second value past a
  // guard that only ever sees the first.
  it("refuses a repeated return_to rather than choosing one of them", async () => {
    await renderPicker({ return_to: [ALLOWED, "https://evil.example/x"] });

    expect(screen.getByText("picker.refused")).toBeInTheDocument();
  });

  it("offers every active actor, the person first", async () => {
    await renderPicker({ return_to: ALLOWED });

    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("u-abc");
    expect(items[1]).toContain("sparky");
    expect(screen.queryByText("picker.refused")).not.toBeInTheDocument();
  });

  // The label names the actor, so the buttons stay distinguishable when they
  // are read out one at a time with no surrounding tile.
  it("names each actor in its own choose button", async () => {
    await renderPicker({ return_to: ALLOWED });

    expect(screen.getByText("picker.choose:u-abc")).toBeInTheDocument();
    expect(screen.getByText("picker.choose:Sparky")).toBeInTheDocument();
  });

  it("carries the validated destination back to the action in a hidden field", async () => {
    const { container } = await renderPicker({ return_to: ALLOWED });

    const hidden = container.querySelector('input[name="return_to"]');
    expect(hidden).toHaveValue(ALLOWED);
  });

  // The person this route exists for arrives from another app and may never
  // have opened /me. Without provisioning first they would be shown nothing.
  it("provisions the person actor before reading the list", async () => {
    await renderPicker({ return_to: ALLOWED });

    expect(ensurePersonActor).toHaveBeenCalledOnce();
    expect(ensurePersonActor.mock.invocationCallOrder[0]!).toBeLessThan(
      listMyActors.mock.invocationCallOrder[0]!,
    );
  });

  it("names the calling app in the subtitle", async () => {
    await renderPicker({ return_to: ALLOWED, app: "Puck" });

    expect(screen.getByText("picker.subtitleFor:Puck")).toBeInTheDocument();
  });

  // The name is supplied by whoever built the link. Uncapped, it could push
  // the tiles off the screen or fill the page with a sentence of its own.
  it("caps a caller-supplied app name", async () => {
    await renderPicker({ return_to: ALLOWED, app: "x".repeat(500) });

    expect(
      screen.getByText(`picker.subtitleFor:${"x".repeat(64)}`),
    ).toBeInTheDocument();
  });

  it("falls back to the generic subtitle when the app name is absent, blank or repeated", async () => {
    for (const app of [undefined, "   ", ["a", "b"]] as (
      string | string[] | undefined
    )[]) {
      const { unmount } = await renderPicker({ return_to: ALLOWED, app });
      expect(screen.getByText("picker.subtitleGeneric")).toBeInTheDocument();
      unmount();
    }
  });

  // chooseActorAction refuses a suspended actor, so offering one would only
  // move the refusal to after the click.
  it("offers no choice for a suspended fursona", async () => {
    listMyActors.mockResolvedValueOnce([
      person,
      { ...sona, status: "suspended" },
    ]);
    await renderPicker({ return_to: ALLOWED });

    expect(screen.queryByText(/sparky/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  // my_actors() always returns the caller's own row, so nothing choosable can
  // only mean the person themselves is suspended — which is worth saying
  // rather than showing an empty grid.
  it("explains an empty picker rather than showing nothing", async () => {
    listMyActors.mockResolvedValueOnce([actor({ status: "suspended" })]);
    await renderPicker({ return_to: ALLOWED });

    expect(screen.getByText("fursonas.suspended")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("lets a listMyActors failure propagate rather than rendering an empty picker", async () => {
    listMyActors.mockRejectedValueOnce(new Error("Could not read your actors"));
    await expect(renderPicker({ return_to: ALLOWED })).rejects.toThrow(
      /Could not read your actors/,
    );
  });
});

// A page reached by a redirect that offers only choices is a trap: the back
// button lands on the link that sent the person here and bounces them forward
// again. Every branch has to offer a way out.
describe("PickerPage's way out", () => {
  /**
   * The cancel link's destination, as rendered.
   *
   * @param container - the rendered container.
   * @returns the href, or null when the link is absent.
   */
  const cancelHref = (container: HTMLElement) =>
    container
      .querySelector(`[${TID_ATTR}="picker-cancel"]`)
      ?.getAttribute("href") ?? null;

  it("offers a link back to the destination carrying no choice", async () => {
    const { container } = await renderPicker({ return_to: ALLOWED });

    const href = cancelHref(container);
    expect(href).not.toBeNull();
    expect(new URL(href!).searchParams.has("actor_ref")).toBe(false);
    expect(new URL(href!).origin).toBe("https://puck.furrycolombia.com");
    expect(screen.getByText("picker.cancel")).toBeInTheDocument();
  });

  // The failure that matters. A caller controls `return_to`, so it can arrive
  // with an actor_ref already on it — and delivering that would report a
  // choice from somebody who explicitly declined to make one.
  it("never hands back an actor_ref the caller planted on return_to", async () => {
    const { container } = await renderPicker({
      return_to: `${ALLOWED}?actor_ref=ref-s&flow=abc`,
    });

    const href = cancelHref(container);
    const url = new URL(href!);
    expect(url.searchParams.has("actor_ref")).toBe(false);
    expect(href).not.toContain("ref-s");
    // The caller's own state is not collateral damage.
    expect(url.searchParams.get("flow")).toBe("abc");
  });

  // Somebody with nothing choosable is the person who most needs a way out,
  // so this must not live inside the branch that renders the list.
  it("offers the way out even when there is nothing to choose", async () => {
    listMyActors.mockResolvedValueOnce([actor({ status: "suspended" })]);
    const { container } = await renderPicker({ return_to: ALLOWED });

    expect(screen.getByText("fursonas.suspended")).toBeInTheDocument();
    expect(cancelHref(container)).not.toBeNull();
  });

  // The refusal cannot offer `return_to` — refusing it is the entire point —
  // so its exit has to lead somewhere of ours instead of nowhere.
  it("gives the refusal an internal exit rather than stranding somebody", async () => {
    const { container } = await renderPicker({
      return_to: "https://evil.example/steal",
    });

    const exit = container.querySelector(`[${TID_ATTR}="picker-exit"]`);
    expect(exit).toBeInTheDocument();
    expect(exit?.getAttribute("href")).toBe("/me");
    expect(screen.getByText("picker.refusedExit")).toBeInTheDocument();
    // And it is not the cancel link wearing a different name: there is no
    // destination to go back to here.
    expect(cancelHref(container)).toBeNull();
  });
});
