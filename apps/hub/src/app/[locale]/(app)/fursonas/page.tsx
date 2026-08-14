import { createServerClient } from "@/shared/infrastructure/supabase-server";
import { getTranslations } from "next-intl/server";
import { tid } from "@/shared/infrastructure/test-id";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import {
  FursonaList,
  ensurePersonActor,
  listMyActors,
} from "@/features/actors";

/**
 * The list of actors the signed-in person may act as.
 *
 * **This page writes**, for the same reason `/me` does: it calls
 * `ensurePersonActor()` before reading. That call is idempotent, so a reload
 * creates nothing — but without it this route depends on `/me` having been
 * rendered first, and the whole point of the platform is that somebody arrives
 * here from another app having never opened `/me` at all. The invariant the
 * list relies on is now enforced here rather than assumed of a different page.
 *
 * Reads through `my_actors()`, which returns the person row first, so
 * "yourself" is the leading row rather than a special case anywhere.
 *
 * **Two states now, not three.** Phase 2b moved the empty states into
 * `FursonaList`, because only it knows whether a filter is narrowing the list —
 * "you have no fursonas" is the wrong sentence when the truth is "none match
 * what you typed", and the page cannot tell those apart. What is left here:
 *
 * 1. **Suspended.** `my_actors()` resolves its owner branch through
 *    `current_person_ref()`, which `0007` filters to active — so a suspended
 *    person gets their person row back and none of their fursonas. That is one
 *    actor, indistinguishable by count from "no fursonas yet". Told that, they
 *    would click "New fursona" and meet the `person actor is suspended` that
 *    `create_fursona` raises, arriving as the generic error boundary. So the
 *    status is read, not the count, and the create link is withheld: offering
 *    an action that can only fail is worse than offering none.
 * 2. **Hand the rows over.** Everything else — ordering, filtering, the two
 *    empty states, pinning, deleting, whether dragging is offered — belongs to
 *    `FursonaList`.
 *
 * The status read is `actors[0]`'s, by `my_actors()`'s own `order by`, which
 * puts `kind = 'person'` first. Not any row's: a suspended FURSONA belonging to
 * an active person is an ordinary state, and reading it as the person's own
 * suspension would withhold the create link from somebody entitled to it.
 *
 * `listMyActors` takes its client now rather than building one, so this
 * supplies a server client. Every function in that module works that way,
 * because building one internally imported `server-only` and broke the
 * client bundle the moment a Client Component touched the module.
 *
 * The header is a decided block rather than three defaults stacked: a heavier
 * title, the action aligned to its baseline, and a rule under both, so the eye
 * has somewhere to start before it reaches the list.
 *
 * Exposes the `fursonas-title` and `fursonas-create` test ids. They exist
 * because a signed-in end-to-end test can reach this page at last — before
 * `tests/e2e/signed-in.spec.ts` nothing could, so nothing here needed naming.
 * The shell's own controls were not an option: the sign-out button lives inside
 * a closed dropdown, so asserting on it would have proved the chrome rather
 * than the page.
 *
 * @returns the fursona list page.
 */
export default async function FursonasPage() {
  await ensurePersonActor();
  const actors = await listMyActors(await createServerClient());
  const t = await getTranslations("fursonas");

  const suspended = actors[0]?.status === "suspended";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--edge)]/40 pb-6">
        <div>
          <h1
            className="font-display text-4xl font-extrabold tracking-tight"
            {...tid("fursonas-title")}
          >
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        {suspended ? null : (
          <Link
            href="/fursonas/new"
            {...tid("fursonas-create")}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-5 py-2.5 font-medium text-[var(--on-accent)]"
          >
            {t("create")}
          </Link>
        )}
      </div>

      {suspended ? (
        <p className="mt-8 text-sm text-[var(--muted)]">{t("suspended")}</p>
      ) : (
        <FursonaList
          initial={actors}
          labels={{
            you: t("you"),
            edit: t("edit"),
            pin: t("pin"),
            unpin: t("unpin"),
            remove: t("remove"),
            confirm: t("confirmDelete"),
            cancel: t("cancel"),
            dragToReorder: t("dragToReorder"),
            search: t("search"),
            all: t("filterAll"),
            empty: t("empty"),
            noMatches: t("noMatches"),
            visibility: {
              private: t("visibility.private"),
              unlisted: t("visibility.unlisted"),
              public: t("visibility.public"),
            },
          }}
        />
      )}
    </>
  );
}
