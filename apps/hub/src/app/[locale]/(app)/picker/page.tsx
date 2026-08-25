import { createServerClient } from "@/shared/infrastructure/supabase-server";
import { getTranslations } from "next-intl/server";
import { Card, WidePageColumn } from "@/shared/presentation/page-shell";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { ActorTile, ensurePersonActor, listMyActors } from "@/features/actors";
import { PickerGrid, declineUrl, isAllowedReturnTo } from "@/features/picker";
import { env } from "@/shared/infrastructure/env";
import { tid } from "@/shared/infrastructure/test-id";
import { chooseActorAction } from "@/app/[locale]/(app)/picker/actions";

/** How a quiet, secondary way off this page is styled. */
const EXIT_LINK =
  "inline-block text-sm text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

/**
 * The longest calling-app name this page will render. The value is a display
 * name supplied by whoever built the link, so it is capped rather than trusted
 * to be short — an unbounded one would let a caller push the tiles off the
 * screen, or fill the page with a sentence of their own choosing.
 */
const MAX_APP_NAME = 64;

/**
 * The picker: where another app asks a person which actor to act as.
 *
 * **`return_to` is checked before anything is rendered**, and a refusal renders
 * no tiles. A grid whose every button leads nowhere is worse than a plain "we
 * cannot send you back": it invites a choice that cannot be honoured, and it
 * spends a database read on a request that was never going anywhere.
 *
 * The refusal deliberately does **not** name the URL it refused. Echoing a
 * caller-supplied string back into the page turns the hub into a surface for
 * displaying an attacker's text under the hub's own name — the phishing value
 * is in the address bar and the branding, not in the redirect.
 *
 * `app` is caller-supplied too and gets the same suspicion: it is interpolated
 * as a next-intl placeholder, so it lands as a text node React escapes, never
 * as markup and never inside an attribute, and it is capped at
 * {@link MAX_APP_NAME} characters. A caller that supplies nothing usable gets
 * the generic subtitle rather than an empty gap in a sentence.
 *
 * Both parameters are typed as Next actually reports them — `string | string[]`,
 * an array when the key repeats — so a crafted `?return_to=a&return_to=b`
 * cannot type-check its way past the guard. A repeated key is treated as
 * absent, which the guard already refuses.
 *
 * **This page writes**, for the reason `/fursonas` does and more so: the person
 * this route exists for arrives from another app and may never have opened
 * `/me`. `ensurePersonActor()` is idempotent, so a reload creates nothing — but
 * without it a first-time visitor would be offered an empty list.
 *
 * Only `active` actors are offered. `chooseActorAction` refuses the rest, so
 * showing them would only move the refusal to after the click. When that leaves
 * nothing at all — which can only mean the person themselves is suspended,
 * since `my_actors()` always returns their own row — the fursona list's
 * suspension message is reused rather than a second copy of the same sentence
 * being added to the catalogues under a picker key.
 *
 * **Every branch offers a way out**, because a page reached by a redirect and
 * offering only choices is a trap: the back button lands on the link that sent
 * the person here and bounces them forward again. Where `return_to` was
 * accepted, declining is a link back to it carrying no `actor_ref` — see
 * `declineUrl`, and note that a consuming app must therefore treat a return
 * with no `actor_ref` as "they declined" and leave the current identity alone.
 * Where it was refused there is no `return_to` to offer, so the exit is an
 * internal link instead.
 *
 * `listMyActors` takes its client now rather than building one, so this
 * supplies a server client. Every function in that module works that way,
 * because building one internally imported `server-only` and broke the
 * client bundle the moment a Client Component touched the module.
 *
 * Every colour it paints comes from a token — `--accent`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * Both outcomes own a {@link WidePageColumn}, preserving the box the signed-in
 * shell supplied before it became full-width for complete page previews.
 *
 * @returns the picker, or the refusal when there is nowhere safe to return to.
 */
export default async function PickerPage({
  searchParams,
}: {
  searchParams: Promise<{
    return_to?: string | string[];
    app?: string | string[];
  }>;
}) {
  const { return_to: rawReturnTo, app: rawApp } = await searchParams;
  const t = await getTranslations("picker");

  const returnTo = typeof rawReturnTo === "string" ? rawReturnTo : "";
  if (!isAllowedReturnTo(returnTo, env.allowedReturnOrigins)) {
    return (
      <WidePageColumn>
        <Card>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {t("refused")}
          </h1>
          <p className="mt-2 text-sm text-(--muted)">{t("refusedHint")}</p>
          {/*
          The one page that cannot offer `return_to` — that is what it is
          refusing — so the way out has to lead somewhere of ours. Without it
          the person is stranded on a dead end reached by a redirect, where
          the back button lands them on the link that sent them here and
          bounces them forward again.

          The locale-aware Link, not an `a`: this destination is inside the
          hub, and a bare href would drop the `/es` prefix and switch somebody's
          language on the way to being helped.
        */}
          <Link
            href="/me"
            className={`mt-6 ${EXIT_LINK}`}
            {...tid("picker-exit")}
          >
            {t("refusedExit")}
          </Link>
        </Card>
      </WidePageColumn>
    );
  }

  const appName =
    typeof rawApp === "string" ? rawApp.trim().slice(0, MAX_APP_NAME) : "";

  await ensurePersonActor();
  const actors = await listMyActors(await createServerClient());
  const choosable = actors.filter((actor) => actor.status === "active");
  // The tile's own labels live under `fursonas`, where the list page put them.
  // Copying them under `picker` would be two strings to keep in step for no
  // gain — "You" is the same word wherever a tile renders it.
  const tActors = await getTranslations("fursonas");

  return (
    <WidePageColumn>
      <Card>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-(--muted)">
          {appName ? t("subtitleFor", { app: appName }) : t("subtitleGeneric")}
        </p>

        {choosable.length === 0 ? (
          <p className="mt-8 text-sm text-(--muted)">{tActors("suspended")}</p>
        ) : (
          <PickerGrid action={chooseActorAction} returnTo={returnTo}>
            {choosable.map((actor) => (
              <ActorTile
                key={actor.actorRef}
                actor={actor}
                youLabel={tActors("you")}
                visibilityLabel={tActors(`visibility.${actor.visibility}`)}
                // The label names the actor so a screen reader reading the
                // buttons alone can still tell them apart.
                choose={{
                  label: t("choose", {
                    name: actor.displayName ?? actor.handle,
                  }),
                }}
              />
            ))}
          </PickerGrid>
        )}

        {/*
        Declining, as a link rather than a button: it is a plain GET navigation
        to a destination already proven allowed, so there is nothing to submit
        and nothing to re-validate. It sits OUTSIDE the branch above on purpose
        — somebody with nothing choosable (a suspended person) is the one who
        most needs a way out, and putting this inside the list branch would
        leave exactly them stranded.

        `declineUrl` strips `actor_ref` rather than passing the caller's URL
        through: a caller may have planted one, and delivering it here would
        report a choice from somebody who explicitly declined to make one.
      */}
        <a
          href={declineUrl(returnTo)}
          className={`mt-8 ${EXIT_LINK}`}
          {...tid("picker-cancel")}
        >
          {t("cancel")}
        </a>
      </Card>
    </WidePageColumn>
  );
}
