"use client";

import { useState } from "react";
import { useRouter } from "@/shared/infrastructure/i18n/navigation";
import { useSupabaseBrowserClient } from "@/shared/infrastructure/supabase-browser";
import { updateMyProfile } from "@/features/actors/infrastructure/my-profile";
import {
  VISIBILITIES,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";
import { tid } from "@/shared/infrastructure/test-id";

/** Translated strings {@link MyProfileForm} renders. */
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
}

/** What {@link MyProfileForm} needs. */
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
 * It refreshes rather than reloading, so the address and its link — rendered by
 * the server component around it — reflect the new state without losing the
 * page.
 *
 * @returns the form.
 */
export function MyProfileForm({ initial, labels }: MyProfileFormProps) {
  const router = useRouter();
  const client = useSupabaseBrowserClient();
  const [values, setValues] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">(
    "idle",
  );

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setState("saving");
        void updateMyProfile(client, values)
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
