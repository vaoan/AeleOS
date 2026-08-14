import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const listMyActors = vi.fn<(...a: unknown[]) => unknown>();
const notFound = vi.fn<(...a: unknown[]) => never>(() => {
  // Real next/navigation signals a 404 by throwing too — modelling that here
  // is what lets "propagates rather than becoming a 404" be distinguishable
  // from "called notFound()".
  throw new Error("NEXT_NOT_FOUND");
});

// The pages hand a client to listMyActors now, so they build one. The real
// builder reaches for Clerk, which no unit test has; the functions under test
// never touch what it returns, because @/features/actors is stubbed.
vi.mock("@/shared/infrastructure/supabase-server", () => ({
  createServerClient: vi.fn(async () => ({})),
}));

vi.mock("next/navigation", () => ({
  notFound: (...a: unknown[]) => notFound(...a),
}));
// Not exercised by this suite — the page never renders far enough to reach
// it — but importing the page pulls in Card -> ... -> LanguageToggle, whose
// module top level calls next-intl's createNavigation() against the real
// "next/navigation", which the mock above no longer fully implements. Stub
// the wrapper so that call never happens.
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: "a",
  redirect: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
  getPathname: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
// The real templates, not a fixture. `labels.ts` maps over them to build the
// picker's label records, so a stub list here would let this suite pass with a
// catalogue that has no entry for a template the app actually ships.
const { FURSONA_TEMPLATES } =
  await import("@/features/actors/domain/fursona-templates");
// Likewise real: labels.ts derives one label per layout from this array, so a
// stub would let the suite pass with a catalogue missing a layout that ships.
const { SECTION_TYPES } =
  await import("@/features/actors/domain/section-schema");

vi.mock("@/features/actors", () => ({
  listMyActors: (...a: unknown[]) => listMyActors(...a),
  FURSONA_TEMPLATES,
  // The page builds its labels from this, so a mocked barrel that omits it
  // fails the page rather than the label code — the mocked-dependency trap
  // again: what stands in for a module has to carry everything the module was
  // being relied on for, and nothing announces a new reliance.
  SECTION_TYPES,
  // A stub, not a render: this suite never mounts the tree, so the stub only
  // needs a stable identity to assert the page picked it, plus a body that
  // would crash loudly if something did try to render it.
  FursonaEditor: () => {
    throw new Error("FursonaEditor should not be rendered in this suite");
  },
}));
// The real module pulls in next/cache's revalidatePath and the locale-aware
const { default: EditFursonaPage } =
  await import("@/app/[locale]/(app)/fursonas/[handle]/edit/page");
const { FursonaEditor } = await import("@/features/actors");

/**
 * A caller-owned actor row, with overrides.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
function actor(over: Partial<Record<string, unknown>> = {}) {
  return {
    actorRef: "ref-1",
    kind: "fursona",
    handle: "sparky",
    displayName: "Sparky",
    avatarUrl: null,
    visibility: "private",
    status: "active",
    ...over,
  };
}

/**
 * Finds the rendered {@link FursonaEditor} element in the page's returned tree,
 * without rendering anything — the page is a plain function returning React
 * elements.
 *
 * It handles the editor being the page's own root, which it is since phase 4a:
 * the card and heading that used to wrap it moved into the editor's toolbar.
 * The children search is kept for the case where a wrapper returns.
 *
 * @param page - the element `EditFursonaPage` resolved to.
 * @returns the editor element.
 */
function formElement(page: ReactElement): ReactElement {
  if (page.type === FursonaEditor) return page;
  const children = (page.props as { children?: ReactElement[] }).children ?? [];
  const found = children.find((child) => child?.type === FursonaEditor);
  if (!found) throw new Error("FursonaEditor was not rendered");
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("EditFursonaPage", () => {
  it("renders the form with the owned fursona's values", async () => {
    listMyActors.mockResolvedValueOnce([actor()]);
    const page = (await EditFursonaPage({
      params: Promise.resolve({ handle: "sparky" }),
    })) as ReactElement;

    const form = formElement(page);
    expect(form.props).toMatchObject({
      actorRef: "ref-1",
      handleEditable: false,
      initial: {
        handle: "sparky",
        displayName: "Sparky",
        avatarUrl: "",
        visibility: "private",
      },
    });
  });

  it("resolves a case-variant handle to the same fursona", async () => {
    listMyActors.mockResolvedValueOnce([actor()]);
    const page = (await EditFursonaPage({
      params: Promise.resolve({ handle: "Sparky" }),
    })) as ReactElement;

    expect(formElement(page).props).toMatchObject({ actorRef: "ref-1" });
  });

  it("404s for a handle the caller does not own", async () => {
    listMyActors.mockResolvedValueOnce([actor({ handle: "someone-elses" })]);
    await expect(
      EditFursonaPage({ params: Promise.resolve({ handle: "sparky" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("404s for a person row's handle", async () => {
    listMyActors.mockResolvedValueOnce([
      actor({ kind: "person", handle: "sparky" }),
    ]);
    await expect(
      EditFursonaPage({ params: Promise.resolve({ handle: "sparky" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  // The database's own update_fursona refuses a suspended fursona too, but
  // only at submit — this is what keeps the edit page from ever offering a
  // form that can only fail there.
  it("404s for a suspended fursona's handle", async () => {
    listMyActors.mockResolvedValueOnce([actor({ status: "suspended" })]);
    await expect(
      EditFursonaPage({ params: Promise.resolve({ handle: "sparky" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("lets a listMyActors failure propagate rather than becoming a 404 or an empty list", async () => {
    listMyActors.mockRejectedValueOnce(new Error("Could not read your actors"));
    await expect(
      EditFursonaPage({ params: Promise.resolve({ handle: "sparky" }) }),
    ).rejects.toThrow(/Could not read your actors/);
    expect(notFound).not.toHaveBeenCalled();
  });
});
