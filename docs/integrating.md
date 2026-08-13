# Integrating an app with AeleOS

For a developer working in **another** repository — Puck, Libra, or whatever
comes next — who wants their app to know who somebody is and which of their
fursonas they are acting as.

AeleOS is the hub at **`me.furrycolombia.com`**. It owns the platform's actor
registry: one row per person, plus one row per fursona they own. Your app keeps
a **mirror** of that registry in its own database, and asks the hub which actor
the person wants to be. Your app never becomes the authority on either.

This document covers the two things your app talks to:

| What                  | Where                                              |
| --------------------- | -------------------------------------------------- |
| The actor-mirror sync | `GET https://me.furrycolombia.com/api/actors/mine` |
| The picker            | `https://me.furrycolombia.com/picker?return_to=…`  |

It assumes you already have the identity half working — your app trusts Clerk,
your Supabase project uses Third-Party Auth, and you store `identity_sub`. If
you do not, start with
[`superpowers/specs/2026-07-26-aeleos-central-auth-design.md`](superpowers/specs/2026-07-26-aeleos-central-auth-design.md).

---

## 1. Sync the user's actors

```
GET https://me.furrycolombia.com/api/actors/mine
Authorization: Bearer <the user's own Clerk session token>
```

**Call this from your server, never from a browser.**

The response is a person's complete actor list, private fursonas included. If
the endpoint were browser-readable, an XSS in any single consuming app would
turn into a disclosure of _every_ user's fursonas from _every_ app on the
platform — the blast radius of one app's bug would be the whole registry. So
there is deliberately **no `Access-Control-Allow-Origin` header** on this
response, for any origin, and none will be added. A `fetch` from page
JavaScript will be blocked by the browser, and that is the design working, not
a misconfiguration to report.

There is **no shared secret and no service account.** The authorization is the
user's own session token, which means a caller can only ever read that user's
actors — the worst a compromised consuming app can do here is read what its
own signed-in user could already see.

### Getting the token

Send the plain Clerk **session** token for the currently signed-in person — in
a Clerk Next.js app, `getToken()` with no arguments:

```ts
import { auth } from "@clerk/nextjs/server";

/** One actor exactly as this endpoint serves it. Nothing else is sent. */
type ResponseActor = {
  actorRef: string;
  kind: "person" | "fursona";
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  visibility: "private" | "unlisted" | "public";
  status: "active" | "suspended";
};

async function fetchActors(): Promise<ResponseActor[]> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error("Not signed in.");

  const response = await fetch("https://me.furrycolombia.com/api/actors/mine", {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    // 401 means the token was missing, malformed or not Clerk's. 500 means the
    // hub could not read its own database. Neither is a reason to wipe your
    // mirror — see "Failing a sync" below.
    throw new Error(`Actor sync failed: ${response.status}`);
  }

  const { actors } = (await response.json()) as { actors: ResponseActor[] };
  return actors;
}
```

The hub reads the token out of the `Authorization` header and verifies it
against Clerk's JWKS. Any other credential — a random string, a JWT signed by
something else, a token from another Clerk instance — gets `401`.

> ⚠️ **`me.furrycolombia.com` runs Clerk's _development_ instance today**
> (`pk_test_…`, frontend API on `clerk.accounts.dev`). A token minted by a
> different Clerk instance — including a production one — will not verify
> against its JWKS and comes back `401` no matter how correct your code is.
> Alongside the empty return-origin allowlist below, this is the second thing
> that will stop a first integration before it starts. Check with a maintainer
> which instance you are pointing at.

### What comes back

`200` with a JSON object. Fields are camelCase:

```json
{
  "actors": [
    {
      "actorRef": "1f3d0f2e-8a4b-4c7d-9e0f-1a2b3c4d5e6f",
      "kind": "person",
      "handle": "u-1f3d0f2e8a4b4c7d9e0f1a2b3c4d5e6f",
      "displayName": null,
      "avatarUrl": null,
      "visibility": "private",
      "status": "active"
    },
    {
      "actorRef": "9c7a4b11-...",
      "kind": "fursona",
      "handle": "moonfest",
      "displayName": "Moonfest",
      "avatarUrl": "https://…",
      "visibility": "public",
      "status": "active"
    }
  ]
}
```

Facts worth building on:

- **`actorRef` is the platform identity of an actor.** A UUID, stable forever,
  the same value in every app. It is the key your mirror uses.
- **There is at most one `kind: "person"` row, and it comes first when it is
  there.** Its `actorRef` is the person's own platform ID — the value your
  mirror should record as the owner of every other row in the same response.
- **The list can legitimately be empty**, including of the person row. This
  endpoint reads the registry; it does not create anything. Somebody with a
  Clerk account who has never opened the hub has no actor row yet, and gets
  `200 {"actors": []}`. The hub provisions the person row on their first visit
  — the picker does it too, before showing the tiles — so a sync after a picker
  round trip has it. Treat an empty list as "not provisioned yet", not as an
  error and not as "this person has no fursonas".
- **`status` can be `"suspended"`.** A suspended fursona is still listed.
  Storing it and refusing to _act_ as it is correct; silently dropping it is
  not, because then a suspension looks identical to a deletion. A suspended
  _person_ is a different shape: their own row still comes back, but their
  fursonas do not.
- **The person row is not a display name.** That sample is what a real one
  looks like: `handle` is `u-` followed by the `actorRef`'s 32 hex digits, and
  `displayName` is `null`. The hub provisions it that way and offers no way to
  change either — a person's handle is not editable anywhere, and the
  fursona-editing path refuses the `u-…` namespace outright. **Do not render
  `person.handle` as a username**; you will put a machine string in front of
  somebody. Show a fursona's `displayName ?? handle`, and for the person row
  use whatever name your own app already knows them by.
- **`identity_sub` and `owner_ref` are never sent and must not be expected.**
  This is not an oversight to work around: the fursona-to-person mapping is
  what makes an anonymous fursona linkable to the human behind it, so it does
  not cross the network. You already know whose list this is — you supplied
  the token — so record that association yourself at sync time.
- **`200`, `401` and `500` carry `cache-control: no-store`.** A cached actor
  list is a stale identity, so do not put a CDN in front of this. (`405` and
  the `204` answer to `OPTIONS` do not carry it — there is no body to cache.)
- **`GET` and `HEAD` are served; `OPTIONS` answers `204` with
  `allow: GET, HEAD, OPTIONS`; anything else is `405`.** `HEAD` is derived from
  `GET` by the framework and answers with the same status and headers and no
  body — useful for a health probe, useless for the actor list.

### The upsert

> **AeleOS ships no mirror schema, and this is not one.** The table below is a
> worked suggestion you own and may name however you like — nothing in the hub
> reads it or checks it. `supabase/migrations/` in this repository is the
> **registry's own** schema, which the hub runs as the authority; it is
> deliberately not a drop-in mirror, and copying it verbatim for this purpose
> does not work:
>
> - `actors_person_shape` requires `identity_sub is not null` for
>   `kind = 'person'` — and `identity_sub` is exactly what this endpoint never
>   sends, so the person row cannot be inserted at all.
> - `owner_ref` is a foreign key to `actors(actor_ref)` and is also never sent.
>
> So: where a concept already has a canonical name, this uses it —
> `actor_ref`, `owner_ref`, `kind`, `handle`, `display_name`, `avatar_url`,
> `visibility`, `status`. Anything that exists only because a mirror is a
> mirror — `synced_at` here — is invented for this document and is yours to
> name, keep or drop.

Key on `actor_ref`, and let the hub win on every field it owns:

```ts
const actors = await fetchActors();
const person = actors.find((actor) => actor.kind === "person");
// Not provisioned yet — see above. Send them through the picker, which
// provisions on arrival, rather than treating this as a failure.
if (!person) return { needsHub: true } as const;

await supabase.from("actors").upsert(
  actors.map((actor) => ({
    actor_ref: actor.actorRef,
    kind: actor.kind,
    handle: actor.handle,
    display_name: actor.displayName,
    avatar_url: actor.avatarUrl,
    visibility: actor.visibility,
    status: actor.status,
    // Not from the response — derived from the fact that you made this call
    // with this person's token, which is the only reason you know these rows
    // are theirs. `null` on the person row, matching the canonical shape: a
    // person actor is owned by nobody. Section 3's check handles both.
    owner_ref: actor.kind === "person" ? null : person.actorRef,
    // Yours, not the platform's — see the note above. It is what lets you tell
    // "still theirs" from "stopped coming back"; see section 4.
    synced_at: new Date().toISOString(),
  })),
  { onConflict: "actor_ref" },
);
```

**Failing a sync is not the same as the user having no actors.** If the request
throws or answers non-`200`, keep the mirror you already have and surface the
error. Treating a failed sync as an empty list logs somebody out of their own
fursonas because of a transient network blip.

When to sync: on sign-in, and after the picker returns (see below) so a fursona
created in the hub thirty seconds ago is already in your mirror when you look
it up.

---

## 2. Send the user to the picker

```
https://me.furrycolombia.com/picker?return_to=<your callback URL>&app=<your app's name>
```

`return_to` is where the hub sends the person once they have chosen; `app` is
a display name shown in the prompt ("_Puck_ is asking which of your identities
to continue with"). Both must be URL-encoded as query values, and `app` is
**truncated to 64 characters** — it is caller-supplied text rendered on our
page, so it is capped rather than trusted to be a sensible length. Omit it and
the prompt uses a generic sentence instead.

```ts
const picker = new URL("https://me.furrycolombia.com/picker");
picker.searchParams.set(
  "return_to",
  "https://puck.furrycolombia.com/acting-as",
);
picker.searchParams.set("app", "Puck");
redirect(picker.toString());
```

### `return_to` must be allowlisted first — ask a maintainer

The hub compares your `return_to` against an **exact origin allowlist**:
scheme, host and port together, no wildcards, no subdomain matching. It is
configured by an AeleOS maintainer in the hub's deployment environment
(`AELEOS_ALLOWED_RETURN_ORIGINS`), not by you and not in your repository.

> ⚠️ **The allowlist in production is currently empty, so every `return_to` is
> refused today.** Until somebody adds your origin, the picker will show "We
> cannot send you back" for every link you build — including a perfectly
> correct one. This is the expected first experience; it is not a bug in your
> integration. **Ask a maintainer to add your origin before you start testing.**

Some consequences of "exact origin":

- `https://puck.furrycolombia.com` and `https://puck.furrycolombia.com:8443`
  are different origins. So are `http://` and `https://` forms of the same host.
- A staging or preview deployment needs its own entry. Ephemeral preview URLs
  with generated hostnames cannot be allowlisted at all — point them at a
  stable staging origin instead.
- A URL carrying credentials (`https://user@puck.furrycolombia.com/…`) is
  refused even when the origin matches.
- A path, query string or fragment on your `return_to` is fine and is
  preserved.

### What the person experiences

- **Not signed into the hub?** They are sent to the hub's own sign-in page,
  with your whole link — `return_to` and `app` intact — carried through, and
  returned to the picker afterwards. You do not need to handle this; just link
  to `/picker` and it works for a first-time visitor. (Pinned by
  `apps/hub/tests/e2e/picker.spec.ts`.)
- **Language:** pin one by linking to `/es/picker?…` or `/en/picker?…`; the
  prefix survives sign-in. An unprefixed `/picker` lets the hub negotiate from
  the browser, with one wrinkle that is worth more than a footnote: the auth
  gate runs _before_ locale negotiation, so a signed-out visitor is redirected
  to `/es/sign-in` — Spanish, the hub's default — whatever their browser asked
  for. Measured: `GET /picker` with `Accept-Language: en` answers
  `307 /es/sign-in`. And it does not end there. That page sets the hub's
  `NEXT_LOCALE` cookie to `es`, so the person is **pinned to Spanish for the
  rest of their session on the hub**, picker included, and not merely shown one
  Spanish page on the way through. If your users are not Spanish speakers, pin
  the locale in your link — this is the difference between one page and every
  page.
- **Refused `return_to`:** they see a plain "we cannot send you back" page and
  stay on the hub. The hub deliberately does not name or link the URL it
  refused, so there is nothing for you to parse and no redirect to follow.

### The return leg

The person comes back to your `return_to` with `actor_ref` appended as a query
parameter:

```
https://puck.furrycolombia.com/acting-as?actor_ref=9c7a4b11-...
```

It is appended with proper URL semantics, so an existing query string on your
`return_to` survives and a fragment stays a fragment. If your `return_to`
already carries an `actor_ref` parameter, it is overwritten — do not use that
name for anything of your own.

### They may also decline — and that returns to you too

The picker offers a way out. Somebody who does not want to choose gets a
"not now" link, and it sends them **to your `return_to` with no `actor_ref` on
it at all**:

```
https://puck.furrycolombia.com/acting-as
```

**Your callback must handle a return with no `actor_ref`.** It means "I do not
want to choose right now" — not an error, not a bug, and not an invitation to
pick something on their behalf. Concretely:

- Do not throw, 400, or render an error page. They did a normal thing.
- **Leave their current identity exactly as it was.** If they were already
  acting as something, they still are. If they were not, they still are not.
- Do not substitute a default — not the person actor, not "the first one",
  not the last one they used.
- **Remember the decline for at least the rest of the current flow.** This is
  the one that bites, and it bites hardest for the person with nothing stored
  yet: they decline, come back with no `actor_ref`, still have no stored actor,
  and section 4's "re-prompt when the stored choice does not resolve" sends
  them straight back to the picker they just walked out of. A flag on the
  session — "asked, declined, do not ask again this visit" — is enough. A
  decline must change nothing _and_ must not immediately re-ask; those are two
  rules, not one.

If your `return_to` already carried an `actor_ref` (yours, or one a link
planted there), the hub **strips it** on this path rather than passing it
through: a decline that arrives carrying a value would be indistinguishable
from a choice, which is precisely the outcome the link exists to avoid. Your
own other query parameters and any fragment survive untouched, so you can still
carry your own state across the round trip.

What it strips is the query parameter `actor_ref`, exactly that name and only
in the query string — a value hidden in the fragment (`#actor_ref=…`) or spelled
in another case (`?ACTOR_REF=…`) survives, because the fragment is yours to keep
and query keys are case-sensitive. Read the choice from the query string and
nowhere else, and a hash-routed app in particular should not go looking for one
in its own fragment.

This is the case integrators miss, because the happy path never shows it.

---

## 3. Verify what comes back — this is not optional

**`actor_ref` arrives in a query string. Anyone can edit a query string.**

It is a **suggestion about what the person picked, never an authorization to
act as it.** Nothing about its arrival proves it belongs to the person who is
signed into your app: a `return_to` URL is just a link, and somebody can type
one, bookmark one, or send one to a friend with a different UUID in it.

Before any of that, the first question is whether there is one at all:

```ts
const suggested = searchParams.get("actor_ref");
// They declined — see section 2. Change nothing and carry on.
if (!suggested) return currentIdentityUnchanged();
```

An absent `actor_ref` is never a reason to fall back to a default actor. That
turns "no thanks" into "yes, as somebody" — the same failure as trusting a
tampered one, reached from the opposite direction.

When there **is** one, the check is three questions, and it must be all three:

1. Does this `actor_ref` exist **in your own mirror**?
2. Does it belong to the **person signed into your app right now**?
3. Is its `status` **active**?

Then act on **your local row**, not on the query parameter.

### Do this

```ts
export async function acceptChoice(actorRef: string, personRef: string | null) {
  // Before anything else. `personRef` comes from your own sync, and section 1
  // says that sync legitimately returns no person row — so this is `null` in a
  // state you will really be in. Every person row carries `owner_ref: null`,
  // so an unguarded `actor.owner_ref === personRef` is `null === null` for a
  // null `personRef`: **true for every person on the platform**, which accepts
  // any UUID pasted into the query string as theirs. Nobody is "theirs" when
  // you do not know who they are.
  if (!personRef) return null;

  const { data: actor, error } = await supabase
    .from("actors")
    .select("actor_ref, kind, handle, display_name, status, owner_ref")
    .eq("actor_ref", actorRef)
    .eq("status", "active") // 3.
    .maybeSingle();

  // A read failure is not "not found". Do not collapse the two: a database
  // hiccup must not read as "that is not your fursona".
  if (error)
    throw new Error(`Could not resolve the chosen actor: ${error.message}`);
  if (!actor) return null; // 1. Unknown or suspended — re-prompt.

  // 2. Ownership, written out rather than folded into the query so the rule is
  // visible: it is theirs if it IS them, or if they own it. `owner_ref` is null
  // on a person row — the canonical shape, not a gap — so both arms are needed
  // and neither alone is enough. The second arm rejects null explicitly as
  // well: redundant given the guard above, and kept because this line is the
  // one that gets copied on its own.
  const theirs =
    actor.actor_ref === personRef ||
    (actor.owner_ref !== null && actor.owner_ref === personRef);
  if (!theirs) return null;

  // From here on, use `actor`. The query parameter has done its only job.
  return actor;
}
```

`personRef` is the signed-in person's own `actorRef` — the `kind: "person"` row
from their last sync — resolved from the session your app already trusts, never
from the URL. It is typed nullable on purpose: "not provisioned yet" is a real
state (section 1), and an unresolved `personRef` must refuse every actor rather
than match the `null` `owner_ref` that every person row carries.

### Not this

```ts
// ❌ Every one of these is an "act as anybody" bug.

// Takes the query parameter's word for it.
const actorRef = searchParams.get("actor_ref");
session.actingAs = actorRef;

// Checks existence but not ownership: any user's actor_ref is accepted, so
// pasting somebody else's UUID posts as their fursona.
const anyActor = await supabase
  .from("actors")
  .select("*")
  .eq("actor_ref", actorRef)
  .maybeSingle();
session.actingAs = anyActor.data.actor_ref;

// Checks ownership but not status: a suspended fursona keeps posting.
const ownedActor = await supabase
  .from("actors")
  .select("*")
  .eq("actor_ref", actorRef)
  .eq("owner_ref", personRef)
  .maybeSingle();

// Compares against a personRef that may not have resolved. `owner_ref` is null
// on every person row, so when personRef is null this is `null === null` and
// any person's actor_ref pasted into the query string is accepted as theirs.
const theirs = actor.actor_ref === personRef || actor.owner_ref === personRef;

// Trusts the display fields from the URL rather than the row, so the name and
// avatar shown beside a post are attacker-chosen.
render({ handle: searchParams.get("handle") });

// Treats a decline as a choice: they clicked "not now" and your app picks for
// them. Any default here is the wrong one.
session.actingAs = searchParams.get("actor_ref") ?? defaultActorRef;
```

The difference between the first block and the second is the difference between
"the person chose this fursona" and "somebody sent this person a link". They
look identical in the address bar.

> This is your app's job, not the hub's. The hub verifies ownership and status
> before it redirects — but that verification protects _the hub_, and it says
> nothing about the request that later arrives at _your_ server, which may not
> have come from the hub at all.

Server-side is the only side that counts. If your client tells your server
which actor to act as, the check belongs on the server receiving that claim,
not in the code that sets it.

---

## 4. Re-prompt when the choice may be stale

A choice is a snapshot. Between the person picking a fursona and your app
acting as it, the fursona can be suspended or renamed in the hub — and **the
hub does not call you when that happens.** There are no webhooks. Your mirror
is only ever as fresh as your last sync.

Two ways a stored choice goes bad:

- **It is suspended.** The row still arrives in a sync, with
  `status: "suspended"`. The hub itself refuses to hand back a suspended actor,
  and so must you.
- **It stops arriving at all.** Suspending a _person_ stops their fursonas from
  being returned — an upsert does not remove the rows you already have, so they
  sit in your mirror looking fine. Stamp every synced row (`synced_at` above)
  and refuse to act as one that did not appear in your most recent **successful**
  sync. "Successful" matters: a failed sync must not age out somebody's whole
  identity.

There is no user-facing delete in the hub today, so suspension is the ordinary
cause of both. Do not build on deletion being impossible — the two rules above
hold either way.

So the check in section 3 is not a one-off at the callback. Re-run it wherever
your app is about to act as the stored actor, and re-prompt when it fails:

```ts
const actor = await acceptChoice(session.actingAs, personRef);
if (!actor) {
  // Not if they already said no this visit — otherwise a decline bounces
  // straight back to the picker, because "no stored actor" is exactly what a
  // decline leaves behind. See section 2.
  if (session.declinedPicker) return withoutAnActor();
  // Do not fall back to the person's own identity, and do not fail silently:
  // both post something under a name they did not choose.
  return redirect(pickerUrl());
}
```

Practical rules:

- **Re-sync, then re-check, before anything that attributes an action to an
  actor** — posting, commenting, transacting.
- **A row that no longer resolves is a re-prompt, not an error page.** It is an
  ordinary thing that happens to people, not an exception.
- **A re-prompt is not a loop.** Somebody who declined has no stored actor to
  resolve, so an unconditional re-prompt sends them back to the picker for as
  long as they keep declining. Honour the decline flag from section 2 before
  redirecting.
- **Never silently substitute the person's own actor.** Somebody who chose to
  act as a fursona and finds their real handle on the post has been outed by
  the fallback.
- **Do not cache a resolved actor across sessions.** The mirror is the cache;
  a second copy of it is a second thing to invalidate.

---

## Reference

| Thing                     | Value                                                                   |
| ------------------------- | ----------------------------------------------------------------------- |
| Hub                       | `https://me.furrycolombia.com`                                          |
| Actor sync                | `GET /api/actors/mine`, `Authorization: Bearer <token>`                 |
| Methods                   | `GET`, `HEAD`; `OPTIONS` → `204`; anything else → `405`                 |
| Sync responses            | `200 {actors}` · `401 {error}` · `500 {error}` — all `no-store`         |
| Picker                    | `GET /picker?return_to=<url>&app=<name>` (`app` capped at 64 chars)     |
| Chose                     | `<return_to>?actor_ref=<uuid>`                                          |
| Declined                  | `<return_to>` with **no** `actor_ref` — change nothing                  |
| CORS on the sync endpoint | None, deliberately. Server-side callers only.                           |
| Clerk instance            | **Development** (`pk_test_…`) — a production-instance token gets `401`. |
| Allowlist                 | Exact origin, set by a maintainer. **Empty in production today.**       |
| Mirror schema             | Yours. AeleOS ships none — see the note in section 1.                   |

Related reading in this repository:

- [`registry.md`](registry.md) — what the actor registry is and who owns it.
- [`../README.md`](../README.md) — the actor-model seam and its conformance
  suite. Note that `supabase/migrations/` is the **registry's own**
  authoritative schema and the pattern for tables that record who did
  something; it is not the mirror this document describes.
- [`superpowers/specs/2026-07-26-aeleos-central-auth-design.md`](superpowers/specs/2026-07-26-aeleos-central-auth-design.md)
  — the identity model, RLS, and why `identity_sub` is sacred.
