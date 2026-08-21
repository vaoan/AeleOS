import { currentUser } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Card } from "@/shared/presentation/page-shell";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { SignOutControl } from "@/features/session";
import {
  ensurePersonActor,
  getPersonActor,
  isMachineHandle,
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
 * Carries a link to the page list and the sign-out control, which is the
 * only visible way out of a session other than Clerk's own account menu — the
 * sign-out control is placed last so the exit stays the last thing on the
 * page, not the link that leads further in.
 *
 * **That link says "Your pages", not "Your fursonas".** It points at `/pages`,
 * where every row is one public page — the person's own profile pinned at the
 * top, then their fursonas — which is why the nav beside it was already
 * renamed. The old label named a subset of what it opens.
 *
 * **It shows the person their own public address**, which nothing else could:
 * `person_addresses` grants no client role anything, so before `my_address`
 * somebody could have a public profile and no way to discover its URL. The
 * address is a link, because the fastest way to know what strangers see is to
 * look.
 *
 * **It carries no editing at all, and that is the point of it.** Naming,
 * publishing, the sections and the theme all moved to the page editor, reached
 * by the pencil on your own row in `/pages` — a person's public page is a page
 * like every other one there, so it is edited where they are. What is left here
 * is what only this page can answer: which address is yours, which platform id
 * every app knows you by, and the way out.
 *
 * **The handle row shows nothing for a person, and that is right.** A person's
 * handle is always the provisioned `u-<actor_ref>` — nobody picks one, because
 * a person's handle appears in no address — so the row was machine text
 * labelled "username", sitting directly above the same value labelled "platform
 * id". Two renderings of one thing, one of them under a name that invited
 * somebody to think they had chosen it.
 *
 * Exposes the `my-address`, `my-profile-link` and `my-platform-id` test ids, which the signed-in
 * end-to-end suite uses to find somebody's own page without reading the
 * database.
 *
 * Every colour it paints comes from a token — `--accent`, `--edge`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * **It centres its own card, because the shell cannot.** The signed-in layout
 * asks for `width="wide"`, which drops `PageShell`'s vertical centring on
 * purpose — right for the page list and the editor, both long. This page is a
 * single short card, so it takes the centring back for itself: a flex box
 * filling the column, centred on both axes, holding the card at the reading
 * measure. Doing it here rather than in the layout keeps the long lists
 * starting at the top where they belong.
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
  const client = await createServerClient();
  const address = await readMyAddress(client);
  const t = await getTranslations("profile");

  return (
    // `flex-1` claims the height the shell's column has left, so `items-center`
    // has something to centre within; without it the box is only as tall as the
    // card and centring means nothing. `max-w-[620px]` is the reading measure
    // the shell's own `column` width uses — the wide layout would otherwise
    // stretch this card to `max-w-7xl`.
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-[620px]">
        <Card>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {actor?.displayName ?? user?.firstName ?? t("fallbackTitle")}
          </h1>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-(--muted)">{t("handle")}</dt>
            {/* A person's handle is ALWAYS the provisioned `u-<actor_ref>`:
                nobody chooses one, because a person's handle appears in no
                address. Shown here it was machine text labelled "username",
                sitting directly above the same value labelled "platform id" —
                two renderings of one thing, one of them under a name that
                invited somebody to think they had picked it. */}
            <dd>
              {actor && !isMachineHandle(actor.handle)
                ? actor.handle
                : t("empty")}
            </dd>
            <dt className="text-(--muted)">{t("address")}</dt>
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
            <dt className="text-(--muted)">{t("platformId")}</dt>
            {/* Monospace on purpose: this string gets read aloud, pasted into
                tickets and compared across apps. */}
            <dd
              className="font-mono text-xs break-all"
              {...tid("my-platform-id")}
            >
              {actorRef}
            </dd>
          </dl>

          <p className="mt-6 text-sm text-(--muted)">{t("addressHint")}</p>
          <p className="mt-2 text-sm text-(--muted)">{t("platformIdHint")}</p>
          <div className="mt-8 border-t border-(--edge)/40 pt-6">
            <Link
              href="/pages"
              className="block text-sm font-medium text-(--accent)"
            >
              {t("pagesLink")}
            </Link>
            {/* The locale is resolved here, on the server, because the button
                cannot know which language the request was for. Sign-out stays
                last: it is the exit, everything else on the page is a way in. */}
            <div className="mt-4">
              <SignOutControl label={t("signOut")} redirectUrl={`/${locale}`} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
