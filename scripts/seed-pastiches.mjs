/**
 * Eight pages that imitate somebody else's social network, as a test of reach.
 *
 * **The question is not "does it render" but "could a person have built this".**
 * `seed-showcase.mjs` proves every key still works and `seed-persona.mjs` proves
 * one page is worth looking at. Neither asks whether the model can be pushed
 * toward a LOOK it was not designed for — and imitating something specific is
 * the only way to find the walls, because a pastiche fails visibly and in a way
 * you can name.
 *
 * Each page targets an era's characteristic ARRANGEMENT, palette and density,
 * which is what the block model either can or cannot express. Its chrome is
 * never copied wholesale — no navigation, no page furniture, no reproduction
 * of anybody's interface.
 *
 * **This paragraph used to say "no marks, no wordmarks, no brand assets" while
 * the list below set eight brand logos as avatars**, and the contradiction sat
 * in one file for a fortnight. The logos were added deliberately and the
 * sentence was never updated — see the actors note, where the change is
 * recorded. What is true is narrower and worth stating exactly: each page uses
 * the site's own mark as the profile AVATAR, hot-linked and never committed,
 * to say which era is being imitated. Nothing else of theirs is reproduced.
 *
 * The era looks under `era-*` take the opposite line and use no artwork at
 * all, because an operating system's chrome is the thing being imitated rather
 * than a name beside it. That difference is deliberate; if it is ever
 * reconciled, reconcile it here rather than in one of the two.
 *
 * **They are `unlisted` on purpose.** A profile lists only public fursonas, so
 * these are reachable by address and absent from `/en/137` — which keeps that
 * curated page what it is while leaving these open for review.
 *
 * Run it with the database password:
 *
 * ```bash
 * set -a; . ./.secrets; set +a; node scripts/seed-pastiches.mjs
 * ```
 */
import pg from "pg";
import { poolerUrl, PROJECT_NAME } from "./aeleos-project.mjs";
import { PAGES, ERA_LOOKS, ERA_LOOKS_META } from "./pastiche-pages.mjs";
import { REFERENCES, inspirationSection } from "./pastiche-references.mjs";

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("SUPABASE_DB_PASSWORD is required (see .secrets).");
  process.exit(1);
}

/** The person these hang off, who already exists. */
const ADDRESS = "137";

const client = new pg.Client({ connectionString: poolerUrl(password) });

/**
 * Runs one statement.
 *
 * @param query - the SQL.
 * @param values - bound parameters, so nothing is concatenated into SQL.
 * @returns the rows.
 */
async function ask(query, values = []) {
  const { rows } = await client.query(query, values);
  return rows;
}

await client.connect();
try {
  const [owner] = await ask(
    "select actor_ref from public.person_addresses where address = $1",
    [ADDRESS],
  );
  if (!owner) throw new Error(`no person at /${ADDRESS}`);
  const person = owner.actor_ref;

  for (const {
    handle,
    displayName,
    blocks,
    theme: pageTheme,
    avatar,
  } of PAGES) {
    const [existing] = await ask(
      "select actor_ref from public.actors where owner_ref = $1 and handle = $2",
      [person, handle],
    );
    const ref = existing
      ? existing.actor_ref
      : (
          await ask(
            `insert into public.actors
               (actor_ref, kind, owner_ref, handle, display_name, visibility, status)
             values (gen_random_uuid(), 'fursona', $1, $2, $3, 'public', 'active')
             returning actor_ref`,
            [person, handle, displayName],
          )
        )[0].actor_ref;
    await ask(
      `update public.actors
          set display_name = $1, visibility = 'public', avatar_url = $2
        where actor_ref = $3`,
      [displayName, avatar, ref],
    );
    // Appended HERE rather than stored in `pastiche-pages.mjs`: nothing about
    // the page module changes, and a later reader of `PAGES` sees the page
    // without it.
    const withReference = [...blocks, inspirationSection(REFERENCES[handle])];
    await ask(
      `insert into public.actor_profiles (actor_ref, sections, theme)
       values ($1, $2::jsonb, $3::jsonb)
       on conflict (actor_ref) do update
         set sections = excluded.sections, theme = excluded.theme`,
      [ref, JSON.stringify(withReference), JSON.stringify(pageTheme)],
    );
    console.log(`[pastiche] /${ADDRESS}/${handle}`);
  }

  // **The era looks, seeded from the same data the picker offers.** They are
  // `unlisted` like every other pastiche: a profile lists only public
  // fursonas, so these stay reachable by address and absent from `/en/137`,
  // which keeps that curated page what it is.
  for (const look of ERA_LOOKS) {
    const handle = look.id;
    const { name: displayName, avatar } = ERA_LOOKS_META[look.id];
    const [existing] = await ask(
      "select actor_ref from public.actors where owner_ref = $1 and handle = $2",
      [person, handle],
    );
    const ref = existing
      ? existing.actor_ref
      : (
          await ask(
            `insert into public.actors
               (actor_ref, kind, owner_ref, handle, display_name, visibility, status)
             values (gen_random_uuid(), 'fursona', $1, $2, $3, 'public', 'active')
             returning actor_ref`,
            [person, handle, displayName],
          )
        )[0].actor_ref;
    // **`public` and an avatar, exactly as the eleven social pages get.** These
    // were `unlisted` with an empty circle, which made them reachable by link
    // and invisible on `/137` — so the five looks this project is proudest of
    // were the five nobody browsing the profile could find. The seeder owns
    // both fields, so a re-run restores them; setting either by hand is what
    // this file's own header warns against.
    await ask(
      `update public.actors
          set display_name = $1, visibility = 'public', avatar_url = $2
        where actor_ref = $3`,
      [displayName, avatar, ref],
    );
    // Appended HERE and never in `ERA_LOOKS` itself: that array is spread into
    // `TEMPLATES` for the picker, so a section stored there would land on the
    // page of every author who picks this look as their starting point.
    const withReference = [
      ...look.blocks,
      inspirationSection(REFERENCES[handle]),
    ];
    await ask(
      `insert into public.actor_profiles (actor_ref, sections, theme)
       values ($1, $2::jsonb, $3::jsonb)
       on conflict (actor_ref) do update
         set sections = excluded.sections, theme = excluded.theme`,
      [ref, JSON.stringify(withReference), JSON.stringify(look.theme)],
    );
    console.log(`[era]      /${ADDRESS}/${handle}`);
  }

  console.log(
    `\n${PROJECT_NAME}: ${PAGES.length} pastiches and ${ERA_LOOKS.length} era looks written.`,
  );
} finally {
  await client.end();
}
