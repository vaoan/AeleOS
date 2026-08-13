"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/shared/infrastructure/i18n/navigation";
import {
  FursonaLimitError,
  HandleTakenError,
  createFursona,
  parseFursona,
  updateFursona,
  type FursonaFormState,
} from "@/features/actors";

/**
 * Creates a fursona from submitted form data.
 *
 * **Re-validates on the server.** The form validates too, but that is a
 * convenience for the person typing — this is the control. Anything reaching
 * this function is unvalidated input regardless of what the client did.
 *
 * The `catch` below rethrows anything it does not recognise exactly as
 * received, never wrapped or swallowed — that, not which side of the `try`
 * it sits on, is what lets `redirect()`'s own control-flow exception pass
 * through safely if it is ever thrown from within one.
 *
 * A reached quota comes back under the reserved `form` key rather than a field
 * name, because no field is at fault — the form renders that one as a
 * form-level alert.
 *
 * @param _prev - the previous form state, unused.
 * @param formData - the submitted fields.
 * @returns field-keyed error codes; on success, revalidates the list at its
 * real, locale-prefixed request path and redirects to it in the caller's
 * locale rather than returning.
 */
export async function createFursonaAction(
  _prev: FursonaFormState,
  formData: FormData,
): Promise<FursonaFormState> {
  const parsed = parseFursona({
    handle: formData.get("handle"),
    displayName: formData.get("displayName") ?? "",
    avatarUrl: formData.get("avatarUrl") ?? "",
    visibility: formData.get("visibility"),
  });
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await createFursona(parsed.value);
  } catch (error) {
    // Rethrown untouched below for anything the two branches do not name — see
    // the doc comment above for why that matters beyond this function.
    if (error instanceof HandleTakenError)
      return { errors: { handle: "handleTaken" } };
    // Against `form`, not a field: the quota is not something the person typed
    // wrong, and keying it to `handle` would tell them to change a handle that
    // is perfectly good.
    if (error instanceof FursonaLimitError)
      return { errors: { form: "limitReached" } };
    throw error;
  }

  const locale = await getLocale();

  // The list is reached through a locale-negotiating redirect, which the
  // browser follows as a fresh navigation — the router's own action-triggered
  // invalidation is not guaranteed to survive that hop. Revalidating explicitly
  // removes the uncertainty rather than risking a stale list as the first
  // thing someone sees after creating a fursona.
  //
  // revalidatePath matches on route structure and the request pathname, not
  // the user-facing URL — Next derives tags like `_N_T_/[locale]/(app)/
  // fursonas/page` and `_N_T_/es/fursonas` from those, never a bare
  // `_N_T_/fursonas`. A locale-less call matches none of them and fails
  // silently: `/fursonas` is not a dynamic route, so Next emits no warning
  // either. The path here has to be the same one the browser is about to
  // request.
  revalidatePath(`/${locale}/fursonas`);
  // The locale-aware redirect, not next/navigation's: the plain version drops
  // the locale prefix, so the app's intl middleware has to renegotiate it on a
  // second hop — and it resolves cookie, then Accept-Language, then default,
  // never the page the person was just looking at. A visitor whose cookie was
  // never written (every request Clerk's auth.protect() short-circuits skips
  // the intl middleware that writes it) would land back on the wrong language.
  return redirect({ href: "/fursonas", locale });
}

/**
 * Edits a fursona from submitted form data.
 *
 * **The `actorRef` in the form is not trusted.** `update_fursona` re-derives
 * ownership from the token in the database and reports "missing" and "not
 * yours" identically, so a tampered hidden field fails there. Deliberately no
 * second ownership check here: two checks drift, and the one in SQL is the
 * one that cannot be bypassed.
 *
 * The handle is not editable, so a placeholder that satisfies the shared
 * schema is supplied and then discarded — reusing one schema keeps the
 * validation rules in a single place rather than forking a nearly-identical
 * one.
 *
 * @param _prev - the previous form state, unused.
 * @param formData - the submitted fields, including `actorRef`.
 * @returns field-keyed error codes; on success, revalidates the list at its
 * real, locale-prefixed request path and redirects to it in the caller's
 * locale rather than returning.
 * @throws when `actorRef` is missing. That field is hidden and never typed by
 * a person, so its absence is a tampered or broken request rather than
 * something a field error could help anyone fix. It must not be reported
 * against `handle` either: the handle is read-only on this form, and a
 * message against a field the person cannot edit is worse than none.
 */
export async function updateFursonaAction(
  _prev: FursonaFormState,
  formData: FormData,
): Promise<FursonaFormState> {
  const actorRef = String(formData.get("actorRef") ?? "");
  if (!actorRef) throw new Error("Missing actorRef on fursona edit submit.");

  const parsed = parseFursona({
    // Not submitted and not editable; a valid placeholder keeps one schema.
    handle: "placeholder",
    displayName: formData.get("displayName") ?? "",
    avatarUrl: formData.get("avatarUrl") ?? "",
    visibility: formData.get("visibility"),
  });
  if (!parsed.ok) {
    // A handle error here can only come from the placeholder, so it is a bug
    // in this function rather than something the person typed. Never show it.
    const errors = { ...parsed.errors };
    delete errors.handle;
    return { errors };
  }

  // The handle is validated but not sent: `update_fursona` has no parameter
  // for it, and reusing the create schema's shape means listing every other
  // field here instead of a discard-via-destructure that unused-vars rejects.
  const fields = {
    displayName: parsed.value.displayName,
    avatarUrl: parsed.value.avatarUrl,
    visibility: parsed.value.visibility,
  };
  await updateFursona(actorRef, fields);

  const locale = await getLocale();

  // Same reasoning as createFursonaAction above: revalidatePath needs the
  // locale-prefixed request path, and the redirect needs to carry the
  // caller's locale rather than let the middleware renegotiate one.
  revalidatePath(`/${locale}/fursonas`);
  return redirect({ href: "/fursonas", locale });
}
