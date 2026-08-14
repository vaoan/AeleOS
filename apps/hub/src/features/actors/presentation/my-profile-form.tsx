"use client";

import { useState } from "react";
import { useRouter } from "@/shared/infrastructure/i18n/navigation";
import { useSupabaseBrowserClient } from "@/shared/infrastructure/supabase-browser";
import { updateMyProfile } from "@/features/actors/infrastructure/my-profile";
import { setActorTheme } from "@/features/actors/infrastructure/actor-theme";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import {
  ThemeConfigurator,
  type ThemeConfiguratorLabels,
} from "@/features/actors/presentation/theme-configurator";
import {
  VISIBILITIES,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Translated strings {@link MyProfileForm} renders.
 *
 * The theme panel's own strings are **nested** under `theme` rather than spread
 * in beside these, because both bags have a `title` and flattening them would
 * have one silently win — the same collision the fursona editor's labels avoid
 * the same way.
 *
 * They are resolved by `themeConfiguratorLabels` from the `fursonas` namespace,
 * shared with the fursona editor: a person's page means exactly what a
 * fursona's does by "accent" and "backdrop", and the visibility words below are
 * already shared for the same reason.
 */
export interface MyProfileFormLabels {
  /** Heading above the form. */
  title: string;
  /** Field label. */
  displayName: string;
  /** Field label. */
  avatarUrl: string;
  /** Field label for the visibility selector. */
  visibilityLabel: string;
  /** One label per visibility value. */
  visibility: Record<Visibility, string>;
  /** The submit button. */
  save: string;
  /** Shown while saving. */
  saving: string;
  /** Shown after a successful save. */
  saved: string;
  /** Shown when the save failed. */
  failed: string;
  /** Explains that publishing a profile does not publish the fursonas. */
  hint: string;
  /** The theme panel's own strings. */
  theme: ThemeConfiguratorLabels;
}

/**
 * What {@link MyProfileForm} needs.
 *
 * It takes the person's own `actorRef` and their stored theme as well as the
 * fields, because the theme lives in a different table and is written by a
 * different function — see the props themselves for why that reference has to
 * be passed when nothing else here does.
 */
export interface MyProfileFormProps {
  /** What is stored now. */
  initial: {
    /** Their name, or empty. */
    displayName: string;
    /** Their picture, or empty. */
    avatarUrl: string;
    /** Who may see the page. */
    visibility: Visibility;
  };
  /**
   * The person's own actor reference.
   *
   * Needed because the theme is stored per actor and `set_actor_theme` takes
   * one, unlike `update_my_profile`, which derives the target from the token.
   * It is a suggestion the database checks rather than trusts — passing
   * somebody else's is refused by `owns_active_actor` with the same "not found"
   * every other writer answers.
   */
  actorRef: string;
  /** How the page looks now. */
  initialTheme: ActorTheme;
  /** Already-translated strings. */
  labels: MyProfileFormLabels;
}

/**
 * Lets somebody name and publish their own profile page.
 *
 * **Publishing is the reason this exists.** A person is provisioned `private`
 * with no interface to change it, so `/{address}` answered 404 for everybody,
 * including them — a page nobody could ever see.
 *
 * The name is here rather than the visibility alone because publishing without
 * it would put a machine string at the top of somebody's page: provisioning
 * sets the handle to `u-<actor_ref>` and `public_person` falls back to it.
 * `docs/integrating.md` tells every consuming app never to show that to a
 * person, and the hub must hold itself to the same rule.
 *
 * The hint says plainly that publishing a profile does not publish the
 * fursonas. Each of those carries its own visibility, and somebody who assumed
 * otherwise would either expose a character they meant to keep back or wonder
 * why a published one is still missing.
 *
 * **It carries the theme panel**, which is why a person's profile can look
 * like anything at all. The column and the public page have supported a theme
 * since theming shipped; there was simply no screen that wrote one, so every
 * profile rendered the design's own colours and no owner could tell that was a
 * gap rather than a rule.
 *
 * That makes this form two writes rather than one — see the submit handler for
 * why they cannot be combined and why a partial save is safe to retry.
 *
 * It refreshes rather than reloading, so the address and its link — rendered by
 * the server component around it — reflect the new state without losing the
 * page.
 *
 * @returns the form.
 */
export function MyProfileForm({
  initial,
  actorRef,
  initialTheme,
  labels,
}: MyProfileFormProps) {
  const router = useRouter();
  const client = useSupabaseBrowserClient();
  const [values, setValues] = useState(initial);
  const [theme, setTheme] = useState(initialTheme);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">(
    "idle",
  );

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setState("saving");
        // **Two writes, and either failing is reported as a failure.** The
        // theme lives in `actor_profiles` and the rest in `actors`, so there is
        // no single call that stores both — `update_my_profile` deliberately
        // takes no actor reference, which is what makes it unable to carry a
        // theme. A half-completed save is possible and is safe to retry: both
        // calls replace rather than merge, so pressing save again stores the
        // whole of what is on screen.
        void Promise.all([
          updateMyProfile(client, values),
          setActorTheme(client, actorRef, theme),
        ])
          .then(() => {
            setState("saved");
            router.refresh();
          })
          .catch(() => setState("failed"));
      }}
    >
      <h2 className="font-display text-lg font-bold tracking-tight">
        {labels.title}
      </h2>

      <div className="grid gap-1.5">
        <label htmlFor="me-display-name" className="text-xs font-medium">
          {labels.displayName}
        </label>
        <input
          id="me-display-name"
          value={values.displayName}
          maxLength={64}
          onChange={(event) =>
            setValues((was) => ({ ...was, displayName: event.target.value }))
          }
          {...tid("me-display-name")}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="me-avatar-url" className="text-xs font-medium">
          {labels.avatarUrl}
        </label>
        <input
          id="me-avatar-url"
          type="url"
          value={values.avatarUrl}
          onChange={(event) =>
            setValues((was) => ({ ...was, avatarUrl: event.target.value }))
          }
          {...tid("me-avatar-url")}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="me-visibility" className="text-xs font-medium">
          {labels.visibilityLabel}
        </label>
        <select
          id="me-visibility"
          value={values.visibility}
          onChange={(event) =>
            setValues((was) => ({
              ...was,
              visibility: event.target.value as Visibility,
            }))
          }
          {...tid("me-visibility")}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
        >
          {VISIBILITIES.map((value) => (
            <option key={value} value={value}>
              {labels.visibility[value]}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-[var(--muted)]">{labels.hint}</p>

      {/* The same panel the fursona editor carries, and the same live preview:
          a person's profile is a public page like any other, and it was the
          only one with a theme nothing could set — the column stored it, the
          page rendered it, and no screen anywhere wrote it. */}
      <ThemeConfigurator
        value={theme}
        onChange={setTheme}
        labels={labels.theme}
      />

      <button
        type="submit"
        disabled={state === "saving"}
        {...tid("me-save")}
        className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-60"
      >
        {state === "saving" ? labels.saving : labels.save}
      </button>

      {state === "saved" ? (
        <p role="status" {...tid("me-saved")} className="text-xs">
          {labels.saved}
        </p>
      ) : null}
      {state === "failed" ? (
        <p role="alert" className="text-xs text-[var(--accent)]">
          {labels.failed}
        </p>
      ) : null}
    </form>
  );
}
