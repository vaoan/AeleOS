import { currentUser } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/page-shell";
import { ensurePersonActor, getPersonActor } from "@/lib/actors";

/**
 * The signed-in person's identity page.
 *
 * **This page writes.** Rendering it calls `ensurePersonActor`, which
 * provisions an actor row on first visit — idempotently, so a reload creates
 * nothing. That side effect is the reason a person exists in the registry at
 * all, so it must not be moved behind a button or a client component.
 *
 * @returns the identity page.
 */
export default async function MePage() {
  const user = await currentUser();
  const actorRef = await ensurePersonActor();
  const actor = await getPersonActor(actorRef);
  const t = await getTranslations("profile");

  return (
    <Card>
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {actor?.displayName ?? user?.firstName ?? t("fallbackTitle")}
      </h1>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-[var(--muted)]">{t("handle")}</dt>
        <dd>{actor?.handle ?? t("empty")}</dd>
        <dt className="text-[var(--muted)]">{t("platformId")}</dt>
        {/* Monospace on purpose: this string gets read aloud, pasted into
            tickets and compared across apps. */}
        <dd className="font-mono text-xs break-all">{actorRef}</dd>
      </dl>
      <p className="mt-6 text-sm text-[var(--muted)]">{t("platformIdHint")}</p>
    </Card>
  );
}
