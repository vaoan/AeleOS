import { auth } from "@clerk/nextjs/server";
import { listMyActors, type Actor } from "@/features/actors";

/**
 * Restricts an actor to the fields this endpoint may expose, by name rather
 * than by forwarding whatever `listMyActors` returned.
 *
 * `Actor` carries no `owner_ref` and no `identity_sub` today — `my_actors()`
 * omits them by construction — but this response is what a consuming app
 * actually parses over the network, so it does not lean on that upstream
 * contract alone. Picking fields here is a second, independent guarantee:
 * a column added to `Actor` later does not reach a caller until someone
 * deliberately adds it to this list too.
 *
 * @param actor - a caller-owned actor as `listMyActors` returned it.
 * @returns the same actor, restricted to the fields this endpoint may expose.
 */
function toResponseActor(actor: Actor) {
  return {
    actorRef: actor.actorRef,
    kind: actor.kind,
    handle: actor.handle,
    displayName: actor.displayName,
    avatarUrl: actor.avatarUrl,
    visibility: actor.visibility,
    status: actor.status,
  };
}

/**
 * Mirrors the signed-in person's actors to a consuming app's own database.
 *
 * This is the one endpoint the platform's other apps (Puck, Libra, …) call —
 * server-to-server, forwarding the person's own Clerk session token in the
 * `Authorization` header. There is no shared secret and no service account,
 * so a caller can only ever read its own actors: the token **is** the
 * authorization.
 *
 * The route lives at `app/api/actors/mine/route.ts`, outside
 * `[locale]/(app)`, so the signed-in layout's `auth.protect()` never covers
 * it. It is also listed in `PUBLIC_ROUTES`, so the proxy's own
 * `auth.protect()` does not run either — both exist to redirect a *browser*
 * to a sign-in page, and a redirect is useless to a server-side caller, which
 * would parse the HTML it points at as an actor list. This handler's own
 * `auth()` check below is the only gate, and it runs, unconditionally,
 * before `listMyActors` is ever reached.
 *
 * **There is deliberately no CORS header on this response.** The payload is
 * a person's complete actor list, including private ones. Adding
 * `Access-Control-Allow-Origin` for an allowlist of consuming apps would let
 * any one of those app's frontend JavaScript read every user's list straight
 * out of the browser — so an XSS in any single consuming app would disclose
 * every user's fursonas from every app. No legitimate caller here runs in a
 * browser: each app's own server reads this, then writes to its own database
 * with its own privileges.
 *
 * `cache-control: no-store` on every response, success or not — a cached
 * actor list is a stale identity, and the next call must always re-check the
 * session and re-read the database.
 *
 * A `listMyActors` failure is caught and answered as JSON too, for the same
 * reason the whole route exists: Next's default failure response is a `500`
 * HTML error page, which is exactly the "server-to-server caller parses HTML
 * as an actor list" problem this endpoint is built to avoid, just reached
 * through the error path instead of the auth one. The failure's own message
 * is never forwarded — `listMyActors` reports the database's own text on
 * error, which can name a table or a constraint, and this response is read
 * by another company's server.
 *
 * @returns `200` with `{ actors }` for a signed-in caller; `401` when
 * unauthenticated; `500` when the read fails.
 */
export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  let actors;
  try {
    actors = (await listMyActors()).map(toResponseActor);
  } catch {
    return Response.json(
      { error: "Could not read your actors" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(
    { actors },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
