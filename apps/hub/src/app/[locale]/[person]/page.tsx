import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageShell } from "@/shared/presentation/page-shell";
import { PublicProfile, ThemeScope, readPublicPerson } from "@/features/actors";

/**
 * Metadata for a person's public profile.
 *
 * **It names nothing when there is nothing to show.** A 404's metadata is the
 * leak nobody looks for: putting the address in the title would confirm which
 * addresses exist to anyone reading a tab, a share preview or a server log,
 * which is the same existence oracle the page body is careful to avoid.
 *
 * `robots` refuses indexing for an **unlisted** profile. Without that, the link
 * somebody chose not to publish ends up in a search result and "unlisted" means
 * nothing.
 *
 * The canonical address is the one the database reports — the vanity when there
 * is one, else the number. Both keep resolving, so without this a profile
 * accumulates two indexed URLs for the same page.
 *
 * @returns the page's metadata.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; person: string }>;
}): Promise<Metadata> {
  const { locale, person } = await params;
  const actor = await readPublicPerson(person);
  if (!actor) {
    const t = await getTranslations({ locale, namespace: "publicProfile" });
    return { title: t("notFoundTitle") };
  }

  return {
    title: actor.displayName ?? actor.handle,
    alternates: { canonical: `/${locale}/${actor.address}` },
    robots: actor.listed ? undefined : { index: false, follow: false },
  };
}

/**
 * A person's public profile, at `/{address}`.
 *
 * Reachable by anybody. Which profiles exist and what they show is settled by
 * `public_person` in `0012`; nothing here re-derives it.
 *
 * **Every hidden state answers the same way.** Private, suspended, deleted, and
 * never-registered all arrive as no row, and all of them `notFound()`. A
 * distinguishable response would let anybody test whether an address is taken,
 * from a page with no session and no rate limit in front of it.
 *
 * @returns the profile, or a 404.
 * The page is wrapped in `ThemeScope`, so a stranger sees it as its owner built
 * it. That sets only the accent and the cloud tints — light and dark stay under
 * the visitor's own toggle, so somebody who needs a dark page gets one wearing
 * the owner's colours rather than instead of them.
 *
 */
export default async function PublicPersonPage({
  params,
}: {
  params: Promise<{ locale: string; person: string }>;
}) {
  const { locale, person } = await params;
  setRequestLocale(locale);

  const actor = await readPublicPerson(person);
  if (!actor) notFound();

  const t = await getTranslations("publicProfile");

  return (
    <PageShell width="wide">
      <ThemeScope theme={actor.theme}>
        <PublicProfile
          actor={actor}
          locale={locale}
          fursonasTitle={t("fursonas")}
        />
      </ThemeScope>
    </PageShell>
  );
}
