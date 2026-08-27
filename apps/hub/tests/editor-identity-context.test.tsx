import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// WHAT THE EDITOR ROUTES HAND THE IDENTITY LEAVES, AND WHY IT NEEDS A TEST.
//
// `src/app/**` is outside the coverage threshold on purpose — a percentage
// over JSX measures rendering rather than behaviour — so a branch added to a
// route is guarded only if somebody writes the case deliberately. These two
// routes had no case at all, and each of them shipped a `PageContext` that
// silently disagreed with the page it was previewing:
//
//   /me/edit      passed `fursonas: []` always, so the REQUIRED `fursonas`
//                 block previewed as a heading over nothing while the page
//                 itself carried a grid of cards. Measured: 330px on the page,
//                 72px in the preview.
//   /pages/new    passed no `owner` at all, and `OwnerLeaf` returns null
//                 without one — so a required block rendered NOTHING on the
//                 one screen where somebody is deciding where to put it.
//
// Both faults are invisible to every pixel guard in the suite, because those
// seed an identity with no display name, no portrait and no fursonas: the
// right answer and the wrong one photograph identically. This asserts the
// props instead, which is the level the faults actually live at.

const ensurePersonActor = vi.fn<(...a: unknown[]) => unknown>();
const getPersonActor = vi.fn<(...a: unknown[]) => unknown>();
const readActorPage = vi.fn<(...a: unknown[]) => unknown>();
const readMyProfileTheme = vi.fn<(...a: unknown[]) => unknown>();
const readMyAddress = vi.fn<(...a: unknown[]) => unknown>();
const readPublicPerson = vi.fn<(...a: unknown[]) => unknown>();

vi.mock("@/shared/infrastructure/supabase-server", () => ({
  createServerClient: vi.fn(async () => ({})),
}));
// Importing either page pulls in the editor's chrome, whose module top level
// calls next-intl's createNavigation() against the real "next/navigation".
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
vi.mock("@/shared/infrastructure/env", () => ({
  env: { hubHost: "parent-host-test.example" },
}));

// The real vocabularies, not fixtures, for the reason `fursona-edit-page`
// states: `labels.ts` maps over each to build a label record, so a stub would
// let this suite pass with a catalogue missing a name that ships.
const { FURSONA_TEMPLATES } =
  await import("@/features/actors/domain/fursona-templates");
const { CONTAINER_MODES, LEAF_KINDS } =
  await import("@/features/actors/domain/block-schema");
const { DESCRIBED_KINDS } =
  await import("@/features/actors/domain/leaf-fields");
const { themeConfiguratorLabels } =
  await import("@/features/actors/presentation/theme-labels");
const { SECTION_SHAPES } =
  await import("@/features/actors/presentation/section-shapes");
const { SPACE_CHOICES } = await import("@/features/actors/domain/block-edits");

vi.mock("@/features/actors", () => ({
  ensurePersonActor: (...a: unknown[]) => ensurePersonActor(...a),
  getPersonActor: (...a: unknown[]) => getPersonActor(...a),
  readActorPage: (...a: unknown[]) => readActorPage(...a),
  readMyProfileTheme: (...a: unknown[]) => readMyProfileTheme(...a),
  readMyAddress: (...a: unknown[]) => readMyAddress(...a),
  readPublicPerson: (...a: unknown[]) => readPublicPerson(...a),
  FURSONA_TEMPLATES,
  CONTAINER_MODES,
  LEAF_KINDS,
  DESCRIBED_KINDS,
  SECTION_SHAPES,
  SPACE_CHOICES,
  themeConfiguratorLabels,
  // A stub with a stable identity, so a case can find which element the route
  // returned without mounting anything.
  FursonaEditor: () => {
    throw new Error("FursonaEditor should not be rendered in this suite");
  },
}));

const { default: EditMyProfilePage } =
  await import("@/app/[locale]/(app)/me/edit/page");
const { default: NewFursonaPage } =
  await import("@/app/[locale]/(app)/pages/new/page");
const { FursonaEditor } = await import("@/features/actors");

/**
 * Finds the editor element a route resolved to.
 *
 * Both routes return it as their own root; the children search is kept for the
 * case where a wrapper returns, exactly as `fursona-edit-page` does it.
 *
 * @param page - the element the route resolved to.
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
  ensurePersonActor.mockResolvedValue("person-ref");
  getPersonActor.mockResolvedValue({
    handle: "u-abc",
    displayName: "Aeleos",
    avatarUrl: null,
    visibility: "public",
  });
  readActorPage.mockResolvedValue({ sections: [], theme: {} });
  readMyProfileTheme.mockResolvedValue({});
  readMyAddress.mockResolvedValue("7");
  // Private is what a person is MINTED with — `visibility text not null
  // default 'private'` in `0001` — so it is the resting state each case that
  // cares overrides.
  readPublicPerson.mockResolvedValue(undefined);
});

describe("EditMyProfilePage", () => {
  it("previews the characters a visitor would see listed", async () => {
    const fursonas = [
      { handle: "luna", displayName: "Luna", avatarUrl: null },
      { handle: "sol", displayName: "Sol", avatarUrl: "https://x.test/s.png" },
    ];
    readPublicPerson.mockResolvedValueOnce({ fursonas });

    const page = (await EditMyProfilePage({
      params: Promise.resolve({ locale: "es" }),
    })) as ReactElement;

    expect(readPublicPerson).toHaveBeenCalledWith("7");
    expect(formElement(page).props).toMatchObject({
      page: { actorKind: "person", address: "7", fursonas },
    });
  });

  // The list is `public_person`'s to decide — only the PUBLIC fursonas appear
  // there, settled in `0012`. A profile a stranger cannot read answers
  // nothing, and the preview then shows the empty list it always showed.
  it("previews an empty list when the profile is not public", async () => {
    readPublicPerson.mockResolvedValueOnce(undefined);

    const page = (await EditMyProfilePage({
      params: Promise.resolve({ locale: "es" }),
    })) as ReactElement;

    expect(formElement(page).props).toMatchObject({ page: { fursonas: [] } });
  });

  // `fursonas` absent means "not this page kind" and makes the block VANISH,
  // where an empty array draws its heading. The distinction is invisible to a
  // `toMatchObject` on the array, so it is asserted on the key itself.
  it("always carries the key, so the block never reads as the wrong page kind", async () => {
    const page = (await EditMyProfilePage({
      params: Promise.resolve({ locale: "es" }),
    })) as ReactElement;

    expect(formElement(page).props).toHaveProperty(["page", "fursonas"]);
  });

  it("does not ask about a person who has no address", async () => {
    readMyAddress.mockResolvedValue(null);

    const page = (await EditMyProfilePage({
      params: Promise.resolve({ locale: "es" }),
    })) as ReactElement;

    expect(readPublicPerson).not.toHaveBeenCalled();
    expect(formElement(page).props).toMatchObject({
      page: { address: "", fursonas: [] },
    });
  });
});

describe("NewFursonaPage", () => {
  // The owner is known before the fursona is: whoever is signed in will own
  // whatever this form creates. Without it the required `owner` block renders
  // nothing at all here.
  it("carries the owner every fursona page must show", async () => {
    readPublicPerson.mockResolvedValueOnce({
      displayName: "Aeleos",
      avatarUrl: "https://example.test/owner.png",
    });

    const page = (await NewFursonaPage()) as ReactElement;

    expect(formElement(page).props).toMatchObject({
      page: {
        address: "7",
        owner: {
          address: "7",
          displayName: "Aeleos",
          avatarUrl: "https://example.test/owner.png",
        },
      },
    });
  });

  it("keeps the owner anonymous when their profile is not public", async () => {
    const page = (await NewFursonaPage()) as ReactElement;

    expect(formElement(page).props).toMatchObject({
      page: { owner: { address: "7", displayName: null, avatarUrl: null } },
    });
  });

  // The fursona's OWN fields stay empty — nothing has been created yet, and
  // the editor fills them from the live form as somebody writes. Asserted so
  // that carrying the owner cannot quietly grow into pre-filling the subject.
  it("leaves the fursona's own fields empty", async () => {
    const page = (await NewFursonaPage()) as ReactElement;

    expect(formElement(page).props).toMatchObject({
      page: { handle: "", displayName: null, avatarUrl: null, measure: null },
    });
  });
});
