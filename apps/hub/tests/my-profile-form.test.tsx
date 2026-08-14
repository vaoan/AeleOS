import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  CANVASES,
  DEFAULT_THEME,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import { SKINS } from "@/shared/domain/skins";

const updateMyProfile = vi.fn();
const setActorTheme = vi.fn();
const refresh = vi.fn();

vi.mock("@/features/actors/infrastructure/my-profile", () => ({
  updateMyProfile: (...a: unknown[]) => updateMyProfile(...a),
}));
vi.mock("@/features/actors/infrastructure/actor-theme", () => ({
  setActorTheme: (...a: unknown[]) => setActorTheme(...a),
}));
vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({ tag: "client" }),
}));
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const { ThemeConfigurator } =
  await import("@/features/actors/presentation/theme-configurator");
const { MyProfileForm } =
  await import("@/features/actors/presentation/my-profile-form");
const { themeConfiguratorLabels } =
  await import("@/features/actors/presentation/theme-labels");

/** Labels as the page resolves them, so a missing string shows up here too. */
const labels = {
  title: "Your page",
  displayName: "Name",
  avatarUrl: "Picture",
  visibilityLabel: "Who can see it",
  visibility: { private: "Private", unlisted: "Unlisted", public: "Public" },
  save: "Save",
  saving: "Saving",
  saved: "Saved",
  failed: "That did not save",
  hint: "Publishing your profile does not publish your fursonas.",
  theme: themeConfiguratorLabels((key) => key),
};

/**
 * Renders the form as `/me` does.
 *
 * @returns nothing.
 */
function renderForm(): void {
  render(
    <MyProfileForm
      actorRef="actor-1"
      initialTheme={DEFAULT_THEME}
      initial={{ displayName: "Luna", avatarUrl: "", visibility: "private" }}
      labels={labels}
    />,
  );
}

beforeEach(() => {
  updateMyProfile.mockReset().mockResolvedValue(undefined);
  setActorTheme.mockReset().mockResolvedValue(undefined);
  refresh.mockReset();
});

describe("MyProfileForm", () => {
  // **THE REGRESSION TEST for a theme nothing could set.** A person's profile
  // is a public page like any other and `actor_profiles` has stored a theme for
  // it since theming shipped — but no screen anywhere wrote one, so every
  // profile rendered the design's own colours and its owner had no way to tell
  // that was a gap rather than a rule. The panel being present is the fix.
  it("offers the theme panel", () => {
    renderForm();
    expect(screen.getByTestId("theme-open")).toBeInTheDocument();
  });

  it("saves the theme alongside the rest of the profile", async () => {
    renderForm();
    fireEvent.click(screen.getByTestId("me-save"));
    expect(await screen.findByTestId("me-saved")).toBeInTheDocument();
    expect(updateMyProfile).toHaveBeenCalledWith(
      { tag: "client" },
      { displayName: "Luna", avatarUrl: "", visibility: "private" },
    );
    expect(setActorTheme).toHaveBeenCalledWith(
      { tag: "client" },
      "actor-1",
      DEFAULT_THEME,
    );
  });

  it("stores what somebody chose rather than what they opened", async () => {
    renderForm();
    fireEvent.click(screen.getByTestId("theme-open"));
    fireEvent.change(screen.getByTestId("theme-skin"), {
      target: { value: "neobrutalism" },
    });
    fireEvent.click(screen.getByTestId("me-save"));
    expect(await screen.findByTestId("me-saved")).toBeInTheDocument();
    expect(setActorTheme.mock.calls[0][2].skin).toBe("neobrutalism");
  });

  // **Both writes are reported, and the theme's is the one that would have been
  // missed.** They are separate calls because `update_my_profile` deliberately
  // takes no actor reference — which is what makes it unable to carry a theme —
  // so a `then` on the profile alone would have shown "Saved" over a theme that
  // never stored.
  it.each([
    ["the profile", () => updateMyProfile],
    ["the theme", () => setActorTheme],
  ])("says so when %s fails to save", async (_which, pick) => {
    pick().mockRejectedValueOnce(new Error("no"));
    renderForm();
    fireEvent.click(screen.getByTestId("me-save"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That did not save",
    );
    expect(screen.queryByTestId("me-saved")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("themeConfiguratorLabels", () => {
  // Built by mapping the lists rather than written out, so a canvas or a style
  // added later either gets a catalogue entry or fails `messages.test.ts`. It
  // can never quietly render its own id at somebody.
  it("names every canvas and every style", () => {
    const resolved = themeConfiguratorLabels((key) => `t:${key}`);
    for (const canvas of CANVASES) {
      expect(resolved.canvases[canvas]).toBe(`t:canvases.${canvas}`);
    }
    for (const skin of SKINS) {
      expect(resolved.skins[skin]).toBe(`t:skins.${skin}`);
    }
  });
});

describe("the copy-from-profile button", () => {
  /**
   * Renders the panel on its own, as the fursona editor mounts it.
   *
   * @param copyFrom - the profile theme to offer, if any.
   * @param onChange - what to call on a change.
   * @returns nothing.
   */
  function renderPanel(
    copyFrom?: ActorTheme,
    onChange: (theme: ActorTheme) => void = () => {},
  ): void {
    render(
      <ThemeConfigurator
        value={DEFAULT_THEME}
        onChange={onChange}
        labels={labels.theme}
        copyFrom={copyFrom}
      />,
    );
    fireEvent.click(screen.getByTestId("theme-open"));
  }

  const themed: ActorTheme = {
    ...DEFAULT_THEME,
    skin: "glass",
    accent: "#00ff88",
  };

  it("copies the whole theme in one press", () => {
    const onChange = vi.fn();
    renderPanel(themed, onChange);
    fireEvent.click(screen.getByTestId("theme-copy-profile"));
    expect(onChange).toHaveBeenCalledWith(themed);
  });

  // **A button that accepts a press and changes nothing is the worst kind**,
  // because nothing tells the person it did nothing. A profile nobody has
  // themed would copy the default onto the default, so there is no button —
  // the same rule the visitor's theme switch follows.
  it("is absent when the profile has nothing to copy", () => {
    renderPanel(DEFAULT_THEME);
    expect(screen.queryByTestId("theme-copy-profile")).toBeNull();
  });

  // The profile's own editor passes nothing, because there the answer would be
  // itself.
  it("is absent when no profile was offered at all", () => {
    renderPanel(undefined);
    expect(screen.queryByTestId("theme-copy-profile")).toBeNull();
  });
});
