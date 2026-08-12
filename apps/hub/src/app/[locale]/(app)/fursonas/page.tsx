import { getTranslations } from "next-intl/server";
import { Card } from "@/shared/presentation/page-shell";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { ActorTile, ensurePersonActor, listMyActors } from "@/features/actors";

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
 * "yourself" is the leading tile rather than a special case in this component.
 *
 * Three states, and the order they are checked in is the point:
 *
 * 1. **Suspended.** `my_actors()` resolves its owner branch through
 *    `current_person_ref()`, which `0007` filters to active — so a suspended
 *    person gets their person row back and none of their fursonas. That is one
 *    actor, which is indistinguishable by count from "no fursonas yet". Told
 *    that, they would click "New fursona" and meet `create_fursona`'s
 *    `person actor is suspended` in the generic error boundary. So the status
 *    is read, not the count, and the create link is withheld: it cannot
 *    succeed, and offering an action that only fails is worse than offering
 *    none.
 * 2. **Nothing to show.** `<= 1`, not `=== 1`: zero actors must render the same
 *    message as one, or a caller with none gets a heading, a subtitle and no
 *    text at all.
 * 3. **The list.**
 *
 * The person row is `actors[0]` by `my_actors()`'s own `order by`, which puts
 * `kind = 'person'` first — the same ordering the leading-tile behaviour above
 * already depends on.
 *
 * Each active fursona tile links to its own edit page, keyed by handle rather
 * than `actorRef`. The person row gets no such link, since a person actor is
 * not edited here, and neither does a suspended fursona: its edit page 404s
 * (see `[handle]/edit/page.tsx`), so offering the link would only dead-end at
 * submit instead of not being offered at all.
 *
 * @returns the fursona list page.
 */
export default async function FursonasPage() {
  await ensurePersonActor();
  const actors = await listMyActors();
  const t = await getTranslations("fursonas");

  const suspended = actors[0]?.status === "suspended";

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        {suspended ? null : (
          <Link
            href="/fursonas/new"
            className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)]"
          >
            {t("create")}
          </Link>
        )}
      </div>

      {suspended ? (
        <p className="mt-8 text-sm text-[var(--muted)]">{t("suspended")}</p>
      ) : actors.length <= 1 ? (
        <p className="mt-8 text-sm text-[var(--muted)]">{t("empty")}</p>
      ) : (
        <ul className="mt-8 grid gap-3">
          {actors.map((actor) => (
            <ActorTile
              key={actor.actorRef}
              actor={actor}
              youLabel={t("you")}
              visibilityLabel={t(`visibility.${actor.visibility}`)}
              edit={
                actor.kind === "fursona" && actor.status === "active"
                  ? { href: `/fursonas/${actor.handle}/edit`, label: t("edit") }
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
