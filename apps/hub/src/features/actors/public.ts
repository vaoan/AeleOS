/**
 * The actor feature's PUBLIC-PAGE surface — what a signed-out visitor's route
 * needs, and deliberately nothing else.
 *
 * **This exists to keep the editor out of a stranger's download.** `index.ts`
 * is one barrel over the whole feature, so a route importing `PublicProfile`
 * from it also pulled `FursonaEditor`'s module graph — react-hook-form, zod,
 * `@dnd-kit`, Motion — into that route's own chunk. Motion's arrival is what
 * made the coupling visible (+109,155 bytes onto two pages nobody signs in to
 * reach), but Motion was never the whole of it.
 *
 * Measured on one build, uncompressed first-load JS from
 * `.next/diagnostics/route-bundle-stats.json`: `/[locale]/[person]` and
 * `/[locale]/[handle]` went from **1,943,136 bytes over 22 chunks** to
 * **1,008,803 over 18** — 934,333 bytes and four chunks off both public
 * routes. The editor routes read 1,950,989 (against 1,950,813 before, this
 * file's own bytes), and `/[locale]/fursonas`, `sign-in`, `/[locale]` and
 * `_not-found` are byte-identical at 778,889 / 749,122 / 738,627 / 452,708 —
 * so nothing moved except what was meant to.
 *
 * The chunk COUNT is the reading that does not depend on a byte total: a
 * public route now carries three chunks beyond the shared `/[locale]` set
 * where an editor route carries seven. Do not try to confirm Motion's absence
 * by grepping a chunk for `LazyMotion` — the literal is minified out of every
 * chunk on every route, so that probe answers "no" whether or not the library
 * is there.
 *
 * **What may go in here.** Only exports a public route genuinely renders, and
 * only ones whose own module graph is free of editor presentation. Adding a
 * symbol that transitively reaches `fursona-editor`, `page-source-dock` or
 * anything under `application/` puts the editor back on the public route and
 * undoes the split silently — the bytes move, no unit test fails, and nobody
 * notices until somebody measures a build again.
 *
 * **What stops that being a convention nobody enforces.** The boundary graph
 * cannot help: `public.ts` and `index.ts` are both `feature-barrel`, so
 * `boundaries/dependencies` sees no difference between them and would happily
 * let a public route import the wide one again.
 * `apps/hub/tests/public-route-imports.test.ts` is what holds the line — it
 * reads the public route sources and fails if one reaches for
 * `@/features/actors` rather than this file.
 *
 * That guard reads STRINGS, so it cannot tell whether a module named here
 * actually exports the symbol claimed from it. `pnpm typecheck` and
 * `pnpm --filter hub build` are what answer that, and both are required
 * checks — this file shipped its first draft naming `infrastructure/actor-page`
 * for `readPublicPerson`/`readPublicFursona`, which live in
 * `infrastructure/public-actors`, with all ten of that suite's cases green.
 *
 * Every symbol here is re-exported from its own module rather than from
 * `index.ts`, so this barrel's graph never includes the wide one.
 */
export { PublicProfile } from "@/features/actors/presentation/public-profile";
export { ThemeScope } from "@/features/actors/presentation/theme-scope";
export { publicName } from "@/features/actors/domain/actor-content";
export { isCustomised } from "@/features/actors/domain/actor-theme";
export {
  readPublicPerson,
  readPublicFursona,
} from "@/features/actors/infrastructure/public-actors";
