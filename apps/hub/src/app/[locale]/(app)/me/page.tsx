import { currentUser } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Card } from "@/shared/presentation/page-shell";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { SignOutControl } from "@/features/session";
import {
  ensurePersonActor,
  getPersonActor,
  readMyAddress,
} from "@/features/actors";
import { createServerClient } from "@/shared/infrastructure/supabase-server";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * The signed-in person's identity page.
 *
 * **This page writes.** Rendering it calls `ensurePersonActor`, which
 * provisions an actor row on first visit — idempotently, so a reload creates
 * nothing. That side effect is the reason a person exists in the registry at
 * all, so it must not be moved behind a button or a client component.
 *
 * Carries a link to the fursona list and the sign-out control, which is the
 * only visible way out of a session other than Clerk's own account menu — the
 * sign-out control is placed last so the exit stays the last thing on the
 * page, not the fursonas link that leads further in.
 *
 * **It shows the person their own public address**, which nothing else could:
 * `person_addresses` grants no client role anything, so before `my_address`
 * somebody could have a public profile and no way to discover its URL. The
 * address is a link, because the fastest way to know what strangers see is to
 * look.
 *
 * Exposes the `my-address` and `my-profile-link` test ids, which the signed-in
 * end-to-end suite uses to find somebody's own page without reading the
 * database.
 *
 * @returns the identity page.
 */
export default async function MePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await currentUser();
  const actorRef = await ensurePersonActor();
  const actor = await getPersonActor(actorRef);
  const address = await readMyAddress(await createServerClient());
  const t = await getTranslations("profile");

  return (
    <Card>
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {actor?.displayName ?? user?.firstName ?? t("fallbackTitle")}
      </h1>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-[var(--muted)]">{t("handle")}</dt>
        <dd>{actor?.handle ?? t("empty")}</dd>
        <dt className="text-[var(--muted)]">{t("address")}</dt>
        <dd {...tid("my-address")}>
          {address ? (
            <Link
              href={`/${address}`}
              {...tid("my-profile-link")}
              className="font-mono underline underline-offset-4"
            >
              {address}
            </Link>
          ) : (
            t("addressEmpty")
          )}
        </dd>
        <dt className="text-[var(--muted)]">{t("platformId")}</dt>
        {/* Monospace on purpose: this string gets read aloud, pasted into
            tickets and compared across apps. */}
        <dd className="font-mono text-xs break-all">{actorRef}</dd>
      </dl>
      <p className="mt-6 text-sm text-[var(--muted)]">{t("addressHint")}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{t("platformIdHint")}</p>
      <div className="mt-8 border-t border-[var(--edge)]/40 pt-6">
        <Link
          href="/fursonas"
          className="block text-sm font-medium text-[var(--accent)]"
        >
          {t("fursonasLink")}
        </Link>
        {/* The locale is resolved here, on the server, because the button
            cannot know which language the request was for. Sign-out stays
            last: it is the exit, everything else on the page is a way in. */}
        <div className="mt-4">
          <SignOutControl label={t("signOut")} redirectUrl={`/${locale}`} />
        </div>
      </div>
    </Card>
  );
}
