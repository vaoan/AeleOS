"use server";

import { createServerClient } from "@/shared/infrastructure/supabase-server";
import { redirect } from "next/navigation";
import { listMyActors } from "@/features/actors";
import { isAllowedReturnTo } from "@/features/picker";
import { env } from "@/shared/infrastructure/env";

/**
 * Hands the chosen actor back to the app that sent the person here.
 *
 * **Nothing in the submitted form is trusted.** Both fields came from a page
 * the caller could edit before submitting, so this repeats every check the
 * page made rather than relying on it:
 *
 * 1. `return_to` is checked against the origin allowlist again. Skipping this
 *    would turn the hub into an open redirect operated through a hidden field.
 * 2. `actor_ref` is resolved against `listMyActors(await createServerClient())`, which returns only the
 *    caller's own actors — so an actor belonging to somebody else is simply not
 *    found. That is the authorization, on the same code path as the happy one.
 * 3. A non-`active` actor is refused for the same reason the picker does not
 *    offer one: handing back a suspended identity would have the calling app
 *    act as it.
 *
 * The destination is assembled with `URL` and `searchParams.set`, never string
 * concatenation. An accepted `return_to` may legitimately carry a query or a
 * fragment, and appending a literal `?actor_ref=…` would fold the parameter
 * into an existing query value or hide it behind a `#` where it never reaches
 * the server — either way the calling app receives no choice at all, chosen by
 * whoever supplied the `return_to`.
 *
 * @param formData - the submitted `return_to` and `actor_ref`, both untrusted.
 * @throws when `return_to` is not on the allowlist, or when `actor_ref` is not
 * an active actor the caller owns. Deliberately generic and deliberately free
 * of the offending value: a refusal that echoes what it refused makes this page
 * a place to reflect an attacker's string back at somebody.
 */
export async function chooseActorAction(formData: FormData): Promise<void> {
  const returnTo = String(formData.get("return_to") ?? "");
  // Checked before the database is touched: a tampered destination is answered
  // without spending a query on it.
  if (!isAllowedReturnTo(returnTo, env.allowedReturnOrigins)) {
    throw new Error("Refused a return_to that is not an allowed origin.");
  }

  const actorRef = String(formData.get("actor_ref") ?? "");
  const actors = await listMyActors(await createServerClient());
  const chosen = actors.find(
    (actor) => actor.actorRef === actorRef && actor.status === "active",
  );
  if (!chosen) {
    throw new Error("Refused an actor that is not yours, or is not active.");
  }

  const destination = new URL(returnTo);
  destination.searchParams.set("actor_ref", chosen.actorRef);

  // next/navigation's redirect, NOT the locale-aware wrapper from
  // @/shared/infrastructure/i18n/navigation. Every other redirect in this app
  // stays inside the hub and wants a locale prefix; this one leaves for another
  // app entirely, where a `/es` prefix would be meaningless at best and would
  // corrupt the destination at worst. Do not "fix" this to match the others.
  redirect(destination.toString());
}
