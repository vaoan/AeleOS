import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageShell } from "@/shared/presentation/page-shell";
import {
  PublicProfile,
  ThemeScope,
  readPublicFursona,
} from "@/features/actors";

/**
 * Metadata for one fursona's page.
 *
 * Same two rules as the profile's, for the same reasons: it names nothing when
 * there is nothing to show, and an **unlisted** fursona refuses indexing — that
 * refusal is the whole difference between `unlisted` and `public`, since an
 * unlisted page is reachable by whoever holds the link and must not arrive in a
 * search result.
 *
 * @returns the page's metadata.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; person: string; handle: string }>;
}): Promise<Metadata> {
  const { locale, person, handle } = await params;
  const actor = await readPublicFursona(person, handle);
  if (!actor) {
    const t = await getTranslations({ locale, namespace: "publicProfile" });
    return { title: t("notFoundTitle") };
  }

  return {
    title: actor.displayName ?? actor.handle,
    alternates: { canonical: `/${locale}/${actor.address}/${actor.handle}` },
    robots: actor.listed ? undefined : { index: false, follow: false },
  };
}

/**
 * One fursona's page, at `/{address}/{handle}`.
 *
 * The handle resolves **within that person only** — handles are unique per
 * owner, so two people's `luna` are two different characters and the address is
 * what tells them apart.
 *
 * Everything hidden answers identically, exactly as on the profile: a private,
 * suspended or deleted fursona, one whose owner is suspended, and one that
 * never existed all `notFound()`.
 *
 * @returns the fursona's page, or a 404.
 * The page is wrapped in `ThemeScope`, so a stranger sees it as its owner built
 * it. That sets only the accent and the cloud tints — light and dark stay under
 * the visitor's own toggle, so somebody who needs a dark page gets one wearing
 * the owner's colours rather than instead of them.
 *
 */
export default async function PublicFursonaPage({
  params,
}: {
  params: Promise<{ locale: string; person: string; handle: string }>;
}) {
  const { locale, person, handle } = await params;
  setRequestLocale(locale);

  const actor = await readPublicFursona(person, handle);
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
